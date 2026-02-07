const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const clients = {};
const sessions = {};
const configs = {};
const chatStates = {}; // Armazena estados dos chats, como solicitação de ajuda

// Inicializa o Gemini AI
const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null;
if (!apiKey) {
  console.error('❌ ERRO CRÍTICO: GEMINI_API_KEY não encontrada no arquivo .env');
} else {
  console.log('✨ Gemini AI configurado com sucesso');
}
const genAI = new GoogleGenerativeAI(apiKey);

// Rota de teste para verificar se o servidor está online
app.get('/', (req, res) => {
  res.send('🚀 Backend do WhatsApp está rodando!');
});

function startClient(id) {
  if (clients[id]) return;
  
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: id }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  sessions[id] = { status: 'initializing', qr: null };

  client.on('qr', (qr) => {
    sessions[id] = {
      status: 'qr',
      qr,
    };
    console.log(`⚡ QR Code gerado para o cliente: ${id}`);
  });

  client.on('ready', () => {
    sessions[id] = {
      status: 'ready',
      qr: null,
    };
    console.log(`WhatsApp ${id} pronto`);
  });

  // Limpar solicitação de ajuda quando o atendente responder
  client.on('message_create', async (msg) => {
    if (msg.fromMe) {
      // Não limpar o alerta se for a própria mensagem automática do bot
      if (msg.body.includes("Um atendente foi notificado")) return;

      try {
        const chat = await msg.getChat();
        const chatKey = `${id}_${chat.id._serialized}`;
        if (chatStates[chatKey]) {
          delete chatStates[chatKey];
          console.log(`✅ Solicitação de ajuda atendida para ${chat.id._serialized}`);
        }
      } catch (e) {
        console.error('Erro ao processar message_create:', e);
      }
    }
  });

  // Escutar mensagens recebidas
  client.on('message', async (msg) => {
    try {
      // Ignorar mensagens de grupos e status
      if (msg.from.includes('@g.us') || msg.from.includes('status@broadcast')) return;
      
      console.log(`📨 Mensagem recebida de ${msg.from}: "${msg.body}"`); // Log movido para o topo para debug

      // Obtém o chat para garantir o ID correto (resolve problemas com LIDs vs Phone IDs)
      const chat = await msg.getChat();
      const chatKey = `${id}_${chat.id._serialized}`;

      // --- DETECÇÃO DE SOLICITAÇÃO DE ATENDENTE ---
      // Normaliza: remove acentos e põe em minúsculas
      const lowerBody = (msg.body || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const helpKeywords = ['atendente', 'humano', 'ajuda', 'suporte', 'falar com alguem', 'falar com atendente'];
      
      // 1. Verifica se é uma NOVA solicitação
      if (helpKeywords.some(keyword => lowerBody.includes(keyword))) {
        chatStates[chatKey] = { helpRequested: true, timestamp: Date.now() };
        console.log(`🆘 ALERTA: Ajuda solicitada no chat ${chat.id._serialized}`);
        
        // Avisa o cliente e interrompe a IA
        await msg.reply("🔔 Um atendente foi notificado e falará com você em breve.");
        return; // <--- IMPEDE A IA DE RESPONDER
      }

      // 2. Verifica se JÁ ESTÁ em modo de atendimento humano
      if (chatStates[chatKey]?.helpRequested) {
        console.log(`🔕 IA silenciada para ${chat.id._serialized} (Aguardando atendimento humano)`);
        return; // <--- IMPEDE A IA DE RESPONDER ENQUANTO O ALERTA ESTIVER ATIVO
      }

      const config = configs[id];

      // Se não tiver configuração ou estiver inativo, não responde
      if (!config || !config.isActive) return;

      // Simula digitação para parecer mais natural
      await chat.sendStateTyping();
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        // Usa o Gemini para gerar uma resposta inteligente
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        // Sanitiza a mensagem do usuário
        const userMessage = msg.body.replace(/"/g, "'");

        const prompt = `
          Você é um agente virtual de atendimento ao cliente via WhatsApp do restaurante "${config.nome || 'Jataí Food'}", simpático, educado, rápido e confiável.
          
          CONTEXTO DO RESTAURANTE:
          - Nome: ${config.nome || 'Jataí Food'}
          - Cardápio Digital: ${config.cardapioLink || 'Solicite o link'}
          - Horário de Atendimento: ${config.horario || 'Consulte no perfil'}
          - Endereço: ${config.endereco || 'Consulte no perfil'}
          - Telefone de Contato: ${config.whatsapp || 'Este número'}
          
          SEU PAPEL:
          - Atender clientes de forma clara, amigável e profissional.
          - Responder perguntas sobre produtos, pedidos, horários, preços, entregas e formas de pagamento.
          - Ajudar o cliente sem usar linguagem técnica.
          - Ser objetivo, mas nunca frio.
          - Manter um tom leve, educado e positivo.

          PERSONALIDADE:
          - Simpático e acessível.
          - Um pouco divertido, mas sem exageros.
          - Sempre educado e paciente.
          - Use emojis com moderação 🙂🍕📦.
          - Nunca discuta com o cliente.
          - Nunca responda de forma rude ou irônica.

          REGRAS DE COMUNICAÇÃO:
          - Use frases curtas e fáceis de entender.
          - Evite termos técnicos.
          - Sempre se coloque à disposição no final da resposta.
          - Se não souber algo, diga que irá verificar e orientar corretamente.

          EXEMPLOS DE TOM:
          - "Claro! Já te explico 😊"
          - "Boa pergunta! Funciona assim..."
          - "Fico feliz em te ajudar!"
          - "Se precisar de mais alguma coisa, é só me chamar 👍"

          DIRETRIZES ESPECÍFICAS:
          - Pedidos: explique o status de forma simples.
          - Valores: seja claro e direto.
          - Fora do escopo: responda com educação e redirecione.
          - Cliente confuso: explique passo a passo.
          - Cliente irritado: mantenha a calma, seja empático e resolutivo.
          - Sugestões: recomende olhar o cardápio no link: ${config.cardapioLink || 'link do cardápio'}.

          O QUE EVITAR:
          - Palavrões.
          - Respostas secas como "não sei" ou "não".
          - Respostas longas demais.
          - Inventar informações.

          MENSAGEM DO CLIENTE: "${userMessage}"

          Responda seguindo estritamente sua personalidade e diretrizes.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        await msg.reply(text);
        console.log(`✅ Resposta IA enviada para ${msg.from}`);
      } catch (aiError) {
        console.error('❌ Erro ao gerar resposta com IA:', aiError.message);
        if (aiError.message.includes('404') || aiError.message.includes('not found')) {
          console.error('💡 DICA: O modelo pode não estar disponível. Execute "node test-gemini.js" na pasta server para verificar os modelos disponíveis.');
        }
        
        // Fallback inteligente:
        // Se for uma saudação simples, manda as boas-vindas.
        // Se for uma pergunta específica que falhou, manda uma mensagem de erro mais adequada.
        const isGreeting = /^(oi|olá|ola|bom dia|boa tarde|boa noite|iniciar|start)$/i.test(msg.body.trim());
        
        let fallbackText = isGreeting 
          ? (config.mensagemBoasVindas || `Olá! Bem-vindo ao ${config.nome}.`) + (config.cardapioLink ? `\nConfira nosso cardápio: ${config.cardapioLink}` : '')
          : "Desculpe, não consegui processar sua pergunta agora. 😕\nMas você pode conferir nosso cardápio aqui: " + (config.cardapioLink || "");

        await msg.reply(fallbackText);
      }

    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
    }
  });

  client.initialize();
  clients[id] = client;
}

app.post('/api/whatsapp/start/:id', async (req, res) => {
  const { id } = req.params;

  if (clients[id]) {
    return res.json({ status: sessions[id]?.status || 'active' });
  }

  startClient(id);

  res.json({ status: 'initializing' });
});

app.get('/api/whatsapp/status/:id', (req, res) => {
  const { id } = req.params;

  if (!sessions[id]) {
    return res.json({ status: 'not_initialized' });
  }

  res.json(sessions[id]);
});

app.get('/api/whatsapp/qr/:id', (req, res) => {
  const { id } = req.params;
  if (sessions[id] && sessions[id].qr) {
    res.json({ status: 'qr', qr: sessions[id].qr });
  } else {
    res.status(404).json({ status: 'qr_not_found' });
  }
});

app.post('/api/config/update/:id', (req, res) => {
  const { id } = req.params;
  configs[id] = req.body;
  console.log(`⚙️ Configuração atualizada para ${id}`);
  res.json({ success: true });
});

app.get('/api/whatsapp/chats/:id', async (req, res) => {
  const { id } = req.params;
  const client = clients[id];
  
  if (!client || !sessions[id] || sessions[id].status !== 'ready') {
    return res.status(404).json({ success: false, message: 'Client not ready' });
  }

  try {
    const chats = await client.getChats();
    const formattedChats = chats.map(chat => ({
      id: chat.id._serialized,
      name: chat.name || chat.id.user,
      number: chat.id.user,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage ? chat.lastMessage.body : '',
      timestamp: chat.timestamp,
      helpRequested: chatStates[`${id}_${chat.id._serialized}`]?.helpRequested || false
    }));
    res.json({ success: true, chats: formattedChats });
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/whatsapp/messages/:id/:chatId', async (req, res) => {
  const { id, chatId } = req.params;
  const client = clients[id];

  if (!client || !sessions[id] || sessions[id].status !== 'ready') {
    return res.status(404).json({ success: false, message: 'Client not ready' });
  }

  try {
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 50 });
    
    const formattedMessages = messages.map(msg => ({
      id: msg.id._serialized,
      fromMe: msg.fromMe,
      body: msg.body,
      timestamp: msg.timestamp
    }));

    res.json({ success: true, messages: formattedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/whatsapp/stop/:id', async (req, res) => {
  const { id } = req.params;

  if (!clients[id]) {
    return res.json({ status: 'not_active' });
  }

  await clients[id].destroy();
  delete clients[id];
  delete sessions[id];

  res.json({ status: 'stopped' });
});

app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Backend rodando em http://localhost:${PORT}`);
  startClient('A');
});
