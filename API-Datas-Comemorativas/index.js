import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import carregarDatas from './src/loadDatasComemorativas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Carrega todas as datas comemorativas dos arquivos mensais
const OBS = carregarDatas();

/**
 * Helpers de data
 */
function nowInTimeZone(timeZone = 'America/Sao_Paulo') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  const isoLike = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  return new Date(isoLike);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseDiaParam(diaStr) {
  const m = diaStr.match(/^(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return { dd, mm };
}

function parseISODateParam(dateStr) {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const yyyy = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const dd = parseInt(m[3], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return { yyyy, mm, dd };
}

function normalizeItem(item) {
  return {
    date: item.date,
    nome: item.nome || item.name,
    tipo: item.tipo || 'comemoracao',
    pais: item.pais || null,
    estado: item.estado || null,
    tags: item.tags || [],
    fonte: item.fonte || item.note || null
  };
}

function observancesForDay(dd, mm) {
  return OBS.filter(o => {
    const m = o.date.match(/^--?(\d{2})-(\d{2})$/);
    if (m) {
      const month = parseInt(m[1], 10);
      const day = parseInt(m[2], 10);
      return day === dd && month === mm;
    }
    return false;
  }).map(normalizeItem);
}

  //Endpoints

// Saúde
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'api-datas-comemorativas', version: '2.0.0' });
});

// Hoje em America/Sao_Paulo
app.get('/api/hoje', (req, res) => {
  const tz = 'America/Sao_Paulo';
  const now = nowInTimeZone(tz);
  const mm = now.getMonth() + 1;
  const dd = now.getDate();
  const todayStr = `${pad2(mm)}-${pad2(dd)}`;

  const observances = observancesForDay(dd, mm);

  res.json({
    date: todayStr,
    timeZone: tz,
    itens: observances
  });
});
//Busca por datas do mês
app.get('/api/mes/:numero', (req, res) => {
  const numero = parseInt(req.params.numero, 10);
  if (isNaN(numero) || numero < 1 || numero > 12) {
    return res.status(400).json({ error: 'Mês inválido. Use um número de 1 a 12.' });
  }

  const datasDoMes = OBS.filter(o => {
    const m = o.date.match(/^--?(\d{2})-(\d{2})$/);
    if (m) {
      const mes = parseInt(m[1], 10);
      return mes === numero;
    }
    return false;
  }).map(normalizeItem);

  res.json({
    mes: pad2(numero),
    total: datasDoMes.length,
    itens: datasDoMes
  });
});

// Busca por dia específico
app.get('/api/datas', (req, res) => {
  const { dia, date } = req.query;

  let dd, mm;
  if (date) {
    const p = parseISODateParam(date);
    if (!p) return res.status(400).json({ error: 'Parâmetro "date" inválido. Use YYYY-MM-DD.' });
    ({ mm, dd } = p);
  } else if (dia) {
    const p = parseDiaParam(dia);
    if (!p) return res.status(400).json({ error: 'Parâmetro "dia" inválido. Use DD-MM.' });
    ({ mm, dd } = p);
  } else {
    return res.status(400).json({ error: 'Informe "dia=DD-MM" ou "date=YYYY-MM-DD".' });
  }

  const dateStr = `${pad2(mm)}-${pad2(dd)}`;
  const observances = observancesForDay(dd, mm);

  res.json({
    date: dateStr,
    itens: observances
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);

});
