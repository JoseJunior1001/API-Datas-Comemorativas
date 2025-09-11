import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import carregarDatas from './src/loadDatasComemorativas.js';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middlewares de segurança e performance
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"]
    }
  }
}));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10kb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: NODE_ENV === 'production' ? 100 : 1000, // limites diferentes por ambiente
  message: { error: 'Muitas requisições, tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Cache de dados em memória com atualização periódica
let OBS = carregarDatas();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

// Atualizar cache periodicamente
setInterval(() => {
  console.log('Atualizando cache de datas comemorativas...');
  OBS = carregarDatas();
}, CACHE_TTL);

/**
 * Helpers de data melhorados
 */
class DateUtils {
  static nowInTimeZone(timeZone = 'America/Sao_Paulo') {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      const parts = formatter.formatToParts(now);
      const partsObj = Object.fromEntries(parts.map(p => [p.type, p.value]));
      
      return new Date(
        `${partsObj.year}-${partsObj.month}-${partsObj.day}T${partsObj.hour}:${partsObj.minute}:${partsObj.second}`
      );
    } catch (error) {
      throw new Error(`Fuso horário inválido: ${timeZone}`);
    }
  }

  static pad2(n) {
    return String(n).padStart(2, '0');
  }

  static parseDiaParam(diaStr) {
    const regex = /^(\d{2})-(\d{2})$/;
    const match = diaStr.match(regex);
    
    if (!match) return null;
    
    const dd = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    
    return { dd, mm };
  }

  static parseISODateParam(dateStr) {
    const regex = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = dateStr.match(regex);
    
    if (!match) return null;
    
    const yyyy = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    const dd = parseInt(match[3], 10);
    
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    
    // Validação adicional de data
    const date = new Date(yyyy, mm - 1, dd);
    if (date.getMonth() + 1 !== mm || date.getDate() !== dd) {
      return null;
    }
    
    return { yyyy, mm, dd };
  }

  static isValidDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && 
           date.getMonth() + 1 === month && 
           date.getDate() === day;
  }
}

function normalizeItem(item) {
  return {
    date: item.date,
    nome: item.nome || item.name || 'Nome não disponível',
    tipo: item.tipo || 'comemoracao',
    pais: item.pais || null,
    estado: item.estado || null,
    tags: Array.isArray(item.tags) ? item.tags : [],
    fonte: item.fonte || item.note || 'Fonte não especificada',
    descricao: item.descricao || null
  };
}

function observancesForDay(dd, mm) {
  return OBS.filter(o => {
    const regex = /^--?(\d{2})-(\d{2})$/;
    const match = o.date.match(regex);
    
    if (match) {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      return day === dd && month === mm;
    }
    return false;
  }).map(normalizeItem);
}

// Cache para respostas frequentes
const responseCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

function getCacheKey(req) {
  return `${req.path}?${new URLSearchParams(req.query).toString()}`;
}

function clearExpiredCache() {
  const now = Date.now();
  for (const [key, value] of responseCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      responseCache.delete(key);
    }
  }
}

setInterval(clearExpiredCache, 60 * 1000); // Limpar cache a cada minuto

/**
 * Middlewares personalizados
 */
function cacheMiddleware(req, res, next) {
  if (req.method !== 'GET') return next();
  
  const cacheKey = getCacheKey(req);
  const cached = responseCache.get(cacheKey);
  
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached.data);
  }
  
  res.setHeader('X-Cache', 'MISS');
  next();
}

function errorHandler(err, req, res, next) {
  console.error('Erro:', err.message);
  
  if (err.message.includes('Fuso horário inválido')) {
    return res.status(400).json({ 
      error: 'Fuso horário inválido',
      message: 'Verifique o parâmetro timeZone'
    });
  }
  
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    ...(NODE_ENV === 'development' && { details: err.message })
  });
}

/**
 * Endpoints melhorados
 */

// Saúde com mais informações
app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    service: 'api-datas-comemorativas', 
    version: '2.1.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Hoje com timezone opcional
app.get('/api/hoje', cacheMiddleware, (req, res) => {
  try {
    const { timeZone = 'America/Sao_Paulo' } = req.query;
    const now = DateUtils.nowInTimeZone(timeZone);
    const mm = now.getMonth() + 1;
    const dd = now.getDate();
    const yyyy = now.getFullYear();
    const todayStr = `${DateUtils.pad2(mm)}-${DateUtils.pad2(dd)}`;

    const observances = observancesForDay(dd, mm);

    const response = {
      date: `${yyyy}-${DateUtils.pad2(mm)}-${DateUtils.pad2(dd)}`,
      formatted: todayStr,
      timeZone,
      itens: observances,
      count: observances.length
    };

    // Cache da resposta
    const cacheKey = getCacheKey(req);
    responseCache.set(cacheKey, {
      data: response,
      timestamp: Date.now()
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Busca por dia específico com mais opções
app.get('/api/datas', cacheMiddleware, (req, res, next) => {
  try {
    const { dia, date, mes, ano } = req.query;
    let dd, mm, yyyy;

    if (date) {
      const parsed = DateUtils.parseISODateParam(date);
      if (!parsed) {
        return res.status(400).json({ 
          error: 'Parâmetro "date" inválido', 
          message: 'Use o formato YYYY-MM-DD com uma data válida' 
        });
      }
      ({ mm, dd, yyyy } = parsed);
    } else if (dia) {
      const parsed = DateUtils.parseDiaParam(dia);
      if (!parsed) {
        return res.status(400).json({ 
          error: 'Parâmetro "dia" inválido', 
          message: 'Use o formato DD-MM com valores válidos' 
        });
      }
      ({ mm, dd } = parsed);
      yyyy = new Date().getFullYear();
    } else if (mes) {
      const month = parseInt(mes, 10);
      if (month < 1 || month > 12) {
        return res.status(400).json({ 
          error: 'Parâmetro "mes" inválido', 
          message: 'Use um valor entre 1 e 12' 
        });
      }
      mm = month;
      yyyy = ano ? parseInt(ano, 10) : new Date().getFullYear();
      
      // Retornar todas as datas do mês
      const monthObservances = OBS.filter(o => {
        const match = o.date.match(/^--?(\d{2})-(\d{2})$/);
        return match && parseInt(match[1], 10) === mm;
      }).map(normalizeItem);
      
      const response = {
        mes: mm,
        ano: yyyy,
        itens: monthObservances,
        count: monthObservances.length
      };

      const cacheKey = getCacheKey(req);
      responseCache.set(cacheKey, {
        data: response,
        timestamp: Date.now()
      });

      return res.json(response);
    } else {
      return res.status(400).json({ 
        error: 'Parâmetros insuficientes', 
        message: 'Informe "dia=DD-MM", "date=YYYY-MM-DD" ou "mes=MM"' 
      });
    }

    if (!DateUtils.isValidDate(yyyy, mm, dd)) {
      return res.status(400).json({ 
        error: 'Data inválida', 
        message: 'A data fornecida não existe no calendário' 
      });
    }

    const dateStr = `${DateUtils.pad2(mm)}-${DateUtils.pad2(dd)}`;
    const observances = observancesForDay(dd, mm);

    const response = {
      date: `${yyyy}-${DateUtils.pad2(mm)}-${DateUtils.pad2(dd)}`,
      formatted: dateStr,
      itens: observances,
      count: observances.length
    };

    const cacheKey = getCacheKey(req);
    responseCache.set(cacheKey, {
      data: response,
      timestamp: Date.now()
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Novo endpoint para buscar por tags
app.get('/api/tags', cacheMiddleware, (req, res, next) => {
  try {
    const { tag } = req.query;
    
    if (!tag) {
      return res.status(400).json({ 
        error: 'Tag não especificada', 
        message: 'Use o parâmetro "tag" para buscar' 
      });
    }

    const filtered = OBS.filter(item => 
      item.tags && Array.isArray(item.tags) && 
      item.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
    ).map(normalizeItem);

    res.json({
      tag,
      itens: filtered,
      count: filtered.length
    });
  } catch (error) {
    next(error);
  }
});

// Documentação da API
app.get('/api/docs', (req, res) => {
  res.json({
    endpoints: {
      '/api/health': 'Verificar status da API',
      '/api/hoje': 'Datas comemorativas de hoje (parâmetro opcional: timeZone)',
      '/api/datas': 'Buscar por data específica (dia=DD-MM ou date=YYYY-MM-DD ou mes=MM)',
      '/api/tags': 'Buscar por tag específica (tag=nome_da_tag)'
    },
    examples: {
      hoje: '/api/hoje?timeZone=America/Sao_Paulo',
      dia: '/api/datas?dia=25-12',
      data: '/api/datas?date=2024-12-25',
      mes: '/api/datas?mes=12',
      tag: '/api/tags?tag=natal'
    }
  });
});

// 404 melhorado
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Rota não encontrada',
    message: 'Consulte /api/docs para ver os endpoints disponíveis',
    path: req.originalUrl
  });
});

// Middleware de erro
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Recebido SIGTERM, encerrando servidor...');
  server.close(() => {
    console.log('Servidor encerrado');
    process.exit(0);
  });
});

const server = app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
  console.log(`Ambiente: ${NODE_ENV}`);
  console.log(`Documentação disponível em http://localhost:${PORT}/api/docs`);
});

export default app;
