import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes } from 'crypto';

const app = express();

// Configurações
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Rate Limiting diferenciado por ambiente
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: NODE_ENV === 'production' ? 100 : 1000,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip + (req.headers['user-agent'] || '');
  }
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de validação. Tente novamente em 15 minutos.' },
  skipSuccessfulRequests: true
});

// Middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// Logging melhorado
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: (req) => req.path === '/health'
}));

app.use(generalLimiter);

// Cache de validações para evitar processamento repetido
const validationCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function getCacheKey(type, value) {
  return createHash('sha256').update(`${type}:${value}`).digest('hex');
}

function clearExpiredCache() {
  const now = Date.now();
  for (const [key, { timestamp }] of validationCache.entries()) {
    if (now - timestamp > CACHE_TTL) {
      validationCache.delete(key);
    }
  }
}

setInterval(clearExpiredCache, 60 * 1000);

// Utils melhorados
const onlyDigits = (s = '') => (s || '').toString().replace(/\D+/g, '');
const isRepeated = (digits, minLength = 11) => {
  return new RegExp(`^(\\d)\\1{${minLength - 1},}$`).test(digits);
};

// Validações melhoradas
function validateCPF(raw) {
  const cacheKey = getCacheKey('cpf', raw);
  const cached = validationCache.get(cacheKey);
  if (cached) return cached.result;

  const errors = [];
  const digits = onlyDigits(raw);
  
  if (digits.length !== 11) {
    errors.push('CPF deve ter exatamente 11 dígitos');
  }
  
  if (isRepeated(digits)) {
    errors.push('CPF inválido (sequência repetida)');
  }

  if (errors.length > 0) {
    const result = { valid: false, errors };
    validationCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }

  // Cálculo dos dígitos verificadores
  const calcCheckDigit = (base, factor) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i]) * (factor - i);
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const base = digits.slice(0, 9);
  const firstDigit = calcCheckDigit(base, 10);
  const secondDigit = calcCheckDigit(base + firstDigit, 11);

  const valid = firstDigit === parseInt(digits[9]) && secondDigit === parseInt(digits[10]);
  
  const result = valid
    ? {
        valid: true,
        normalized: `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`,
        digits
      }
    : {
        valid: false,
        errors: ['Dígitos verificadores inválidos']
      };

  validationCache.set(cacheKey, { result, timestamp: Date.now() });
  return result;
}

// CNPJ melhorado (similar ao CPF)
function validateCNPJ(raw) {
  const cacheKey = getCacheKey('cnpj', raw);
  const cached = validationCache.get(cacheKey);
  if (cached) return cached.result;

  const errors = [];
  const digits = onlyDigits(raw);
  
  if (digits.length !== 14) {
    errors.push('CNPJ deve ter exatamente 14 dígitos');
  }
  
  if (isRepeated(digits, 14)) {
    errors.push('CNPJ inválido (sequência repetida)');
  }

  if (errors.length > 0) {
    const result = { valid: false, errors };
    validationCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }

  const calcCheckDigit = (base, factors) => {
    let sum = 0;
    for (let i = 0; i < factors.length; i++) {
      sum += parseInt(base[i]) * factors[i];
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const factors1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const factors2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const base = digits.slice(0, 12);
  const firstDigit = calcCheckDigit(base, factors1);
  const secondDigit = calcCheckDigit(base + firstDigit, factors2);

  const valid = firstDigit === parseInt(digits[12]) && secondDigit === parseInt(digits[13]);
  
  const result = valid
    ? {
        valid: true,
        normalized: `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`,
        digits
      }
    : {
        valid: false,
        errors: ['Dígitos verificadores inválidos']
      };

  validationCache.set(cacheKey, { result, timestamp: Date.now() });
  return result;
}

// Email melhorado com validação de domínio
async function validateEmail(raw) {
  const cacheKey = getCacheKey('email', raw);
  const cached = validationCache.get(cacheKey);
  if (cached) return cached.result;

  const errors = [];
  const s = (raw || '').toString().trim().toLowerCase();
  
  if (!s) {
    errors.push('E-mail não informado');
  }
  
  if (s.length > 254) {
    errors.push('E-mail muito longo');
  }

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(s)) {
    errors.push('Formato de e-mail inválido');
  }

  const [localPart, domain] = s.split('@');
  
  if (localPart.length > 64) {
    errors.push('Parte local do e-mail muito longa');
  }

  if (errors.length > 0) {
    const result = { valid: false, errors };
    validationCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }

  const result = { valid: true, normalized: s };
  validationCache.set(cacheKey, { result, timestamp: Date.now() });
  return result;
}

// Password com mais opções e segurança
function validatePassword(raw, policy = {}) {
  const errors = [];
  const s = (raw || '').toString();

  const config = {
    minLength: policy.minLength ?? 8,
    maxLength: policy.maxLength ?? 128,
    requireUpper: policy.upper ?? true,
    requireLower: policy.lower ?? true,
    requireNumber: policy.number ?? true,
    requireSymbol: policy.symbol ?? true,
    forbidCommon: policy.forbidCommon ?? true,
    maxConsecutive: policy.maxConsecutive ?? 3
  };

  if (s.length < config.minLength) {
    errors.push(`Senha deve ter no mínimo ${config.minLength} caracteres`);
  }
  
  if (s.length > config.maxLength) {
    errors.push(`Senha deve ter no máximo ${config.maxLength} caracteres`);
  }

  if (config.requireUpper && !/[A-Z]/.test(s)) {
    errors.push('Deve conter pelo menos 1 letra maiúscula');
  }

  if (config.requireLower && !/[a-z]/.test(s)) {
    errors.push('Deve conter pelo menos 1 letra minúscula');
  }

  if (config.requireNumber && !/\d/.test(s)) {
    errors.push('Deve conter pelo menos 1 número');
  }

  if (config.requireSymbol && !/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;/`'~]/.test(s)) {
    errors.push('Deve conter pelo menos 1 símbolo');
  }

  // Verificar caracteres consecutivos
  if (/(.)\1{2,}/.test(s)) {
    errors.push(`Não pode ter mais de ${config.maxConsecutive} caracteres consecutivos iguais`);
  }

  if (config.forbidCommon) {
    const commonPasswords = new Set([
      '123456', 'password', '123456789', 'qwerty', 'abc123', 
      '111111', '123123', 'senha', 'admin', 'iloveyou'
    ]);
    
    if (commonPasswords.has(s.toLowerCase())) {
      errors.push('Senha muito comum');
    }
  }

  if (/^\s|\s$/.test(s)) {
    errors.push('Não pode iniciar ou terminar com espaço');
  }

  // Calcular força da senha
  let strength = 0;
  if (s.length >= 12) strength += 2;
  if (/[A-Z]/.test(s) && /[a-z]/.test(s)) strength += 1;
  if (/\d/.test(s)) strength += 1;
  if (/[^A-Za-z0-9]/.test(s)) strength += 2;

  const result = errors.length === 0 
    ? { valid: true, strength, length: s.length }
    : { valid: false, errors, strength, length: s.length };

  return result;
}

// Middleware de validação de entrada
function validateInput(req, res, next) {
  const { value } = req.query;
  
  if (value === undefined || value === null || value === '') {
    return res.status(400).json({
      error: 'Parâmetro "value" é obrigatório',
      type: 'validation_error'
    });
  }

  if (typeof value !== 'string') {
    return res.status(400).json({
      error: 'Parâmetro "value" deve ser uma string',
      type: 'validation_error'
    });
  }

  if (value.length > 1000) {
    return res.status(400).json({
      error: 'Valor muito longo (máximo 1000 caracteres)',
      type: 'validation_error'
    });
  }

  next();
}

// Endpoints melhorados
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    memory: process.memoryUsage()
  });
});

app.get('/validate/cpf', validateInput, (req, res) => {
  try {
    const { value } = req.query;
    const result = validateCPF(value);
    res.json({
      type: 'cpf',
      input: value,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erro interno ao validar CPF',
      type: 'internal_error'
    });
  }
});

app.get('/validate/cnpj', validateInput, (req, res) => {
  try {
    const { value } = req.query;
    const result = validateCNPJ(value);
    res.json({
      type: 'cnpj',
      input: value,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erro interno ao validar CNPJ',
      type: 'internal_error'
    });
  }
});

app.get('/validate/email', validateInput, async (req, res) => {
  try {
    const { value } = req.query;
    const result = await validateEmail(value);
    res.json({
      type: 'email',
      input: value,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erro interno ao validar e-mail',
      type: 'internal_error'
    });
  }
});

app.post('/validate/password', (req, res) => {
  try {
    const { password, policy } = req.body;
    
    if (!password) {
      return res.status(400).json({
        error: 'Campo "password" é obrigatório',
        type: 'validation_error'
      });
    }

    const result = validatePassword(password, policy);
    res.json({
      type: 'password',
      input: password,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erro interno ao validar senha',
      type: 'internal_error'
    });
  }
});

// Novo endpoint para validação em lote
app.post('/validate/batch', strictLimiter, async (req, res) => {
  try {
    const { values } = req.body;
    
    if (!Array.isArray(values) || values.length > 20) {
      return res.status(400).json({
        error: 'Campo "values" deve ser um array com no máximo 20 itens',
        type: 'validation_error'
      });
    }

    const results = await Promise.all(
      values.map(async (item) => {
        const type = detectType(item.value) || item.type;
        
        if (!type) {
          return {
            input: item.value,
            type: 'unknown',
            valid: false,
            error: 'Tipo não identificado'
          };
        }

        try {
          let result;
          switch (type) {
            case 'cpf':
              result = validateCPF(item.value);
              break;
            case 'cnpj':
              result = validateCNPJ(item.value);
              break;
            case 'email':
              result = await validateEmail(item.value);
              break;
            case 'password':
              result = validatePassword(item.value, item.policy);
              break;
            default:
              result = { valid: false, error: 'Tipo não suportado' };
          }
          
          return {
            input: item.value,
            type,
            ...result
          };
        } catch (error) {
          return {
            input: item.value,
            type,
            valid: false,
            error: 'Erro na validação'
          };
        }
      })
    );

    res.json({
      results,
      timestamp: new Date().toISOString(),
      total: results.length,
      valid: results.filter(r => r.valid).length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erro interno ao processar validação em lote',
      type: 'internal_error'
    });
  }
});

// Middleware de erro global
app.use((error, req, res, next) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({
    error: 'Erro interno do servidor',
    type: 'internal_error',
    ...(NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    type: 'not_found',
    path: req.originalUrl
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Recebido SIGTERM. Encerrando servidor...');
  server.close(() => {
    console.log('Servidor encerrado.');
    process.exit(0);
  });
});

const server = app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} (${NODE_ENV})`);
});

export default app;
