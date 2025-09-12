import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lista de meses com seus arquivos correspondentes
const meses = [
  { nome: 'janeiro', arquivo: 'janeiro.json' },
  { nome: 'fevereiro', arquivo: 'fevereiro.json' },
  { nome: 'marco', arquivo: 'marco.json' },
  { nome: 'abril', arquivo: 'abril.json' },
  { nome: 'maio', arquivo: 'maio.json' },
  { nome: 'junho', arquivo: 'junho.json' },
  { nome: 'julho', arquivo: 'julho.json' },
  { nome: 'agosto', arquivo: 'agosto.json' },
  { nome: 'setembro', arquivo: 'setembro.json' },
  { nome: 'outubro', arquivo: 'outubro.json' },
  { nome: 'novembro', arquivo: 'novembro.json' },
  { nome: 'dezembro', arquivo: 'dezembro.json' }
];

export default function carregarDatas() {
  const todasDatas = [];
  const dataDir = path.join(__dirname, '..', 'data');

  console.log(`📂 Carregando dados da pasta: ${dataDir}`);

  // Verifica se a pasta data existe
  if (!fs.existsSync(dataDir)) {
    console.error('❌ Pasta data não encontrada!');
    return todasDatas;
  }

  for (const mes of meses) {
    const arquivoPath = path.join(dataDir, mes.arquivo);
    
    try {
      if (fs.existsSync(arquivoPath)) {
        const dados = JSON.parse(fs.readFileSync(arquivoPath, 'utf8'));
        
        // Adiciona metadados do mês a cada item
        const dadosComMes = dados.map(item => ({
          ...item,
          mes: mes.nome,
          arquivoOrigem: mes.arquivo
        }));
        
        todasDatas.push(...dadosComMes);
        console.log(`✅ ${mes.arquivo}: ${dados.length} datas carregadas`);
      } else {
        console.warn(`⚠️  Arquivo não encontrado: ${mes.arquivo}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao carregar ${mes.arquivo}:`, error.message);
    }
  }

  console.log(`📊 Total de datas comemorativas carregadas: ${todasDatas.length}`);
  return todasDatas;
}

// Função de teste para verificar o carregamento
export function testarCarregamento() {
  const dados = carregarDatas();
  console.log('\n🔍 Amostra dos primeiros 3 itens:');
  console.log(dados.slice(0, 3));
  
  console.log('\n📈 Estatísticas:');
  const porMes = {};
  dados.forEach(item => {
    const mes = item.mes || 'desconhecido';
    porMes[mes] = (porMes[mes] || 0) + 1;
  });
  
  console.log('Datas por mês:', porMes);
  
  return dados;
}
