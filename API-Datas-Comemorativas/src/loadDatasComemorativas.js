import fs from 'fs';
import path from 'path';

const meses = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
];

const basePath = path.join(process.cwd(), 'src', 'datasComemorativas');

function carregarDatas() {
  const todas = [];

  for (const mes of meses) {
    const filePath = path.join(basePath, `${mes}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const datas = JSON.parse(raw);
        todas.push(...datas);
      } catch (err) {
        console.error(`Erro ao carregar ${mes}.json:`, err.message);
      }
    } else {
      console.warn(`Arquivo ${mes}.json não encontrado.`);
    }
  }

  return todas;
}

export default carregarDatas;