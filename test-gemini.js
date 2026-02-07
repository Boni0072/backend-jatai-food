require('dotenv').config();
const https = require('https');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("❌ ERRO: GEMINI_API_KEY não encontrada no .env");
  process.exit(1);
}

console.log('🔍 Consultando API do Google para listar modelos disponíveis...\n');

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => { data += chunk; });

  res.on('end', () => {
    const response = JSON.parse(data);
    
    if (response.error) {
      console.error("❌ ERRO DA API:", response.error.message);
      console.log("\n💡 DICA: Verifique se a 'Google Generative Language API' está habilitada no Google Cloud Console.");
    } else if (response.models) {
      console.log("✅ Modelos disponíveis para sua chave:");
      response.models.forEach(m => console.log(`   - ${m.name.replace('models/', '')}`));
    } else {
      console.log("⚠️ Resposta inesperada:", response);
    }
  });
}).on('error', (err) => {
  console.error("Erro na requisição:", err.message);
});