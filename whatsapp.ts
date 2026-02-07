import { Client, LocalAuth } from 'whatsapp-web.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Interface para armazenar o estado de cada sessão
interface SessionData {
  client: Client;
  qr: string | null;
  status: 'INITIALIZING' | 'QR_READY' | 'AUTHENTICATED' | 'READY' | 'DISCONNECTED';
}

// Interface para configurações (compatível com o frontend)
interface ConfigData {
  [key: string]: any;
}

interface ChatState {
  helpRequested: boolean;
  timestamp: number;
}

// Estende o objeto global para manter as sessões em memória (evita recriação no hot-reload)
declare global {
  var whatsappSessions: { [key: string]: SessionData };
  var whatsappConfigs: { [key: string]: ConfigData };
  var whatsappChatStates: { [key: string]: ChatState };
}

if (!global.whatsappSessions) {
  global.whatsappSessions = {};
}
if (!global.whatsappConfigs) {
  global.whatsappConfigs = {};
}
if (!global.whatsappChatStates) {
  global.whatsappChatStates = {};
}

export class WhatsAppManager {
  static async startSession(id: string): Promise<void> {
    if (global.whatsappSessions[id] && global.whatsappSessions[id].client) {
      // Se já estiver pronto ou autenticado, não recria
      const currentStatus = global.whatsappSessions[id].status;
      if (currentStatus === 'READY' || currentStatus === 'AUTHENTICATED') {
        return;
      }
    }

    // Inicializa o estado
    global.whatsappSessions[id] = {
      client: new Client({
        authStrategy: new LocalAuth({ clientId: id }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      }),
      qr: null,
      status: 'INITIALIZING',
    };

    const session = global.whatsappSessions[id];

    session.client.on('qr', (qr) => {
      console.log(`[WhatsApp ${id}] QR Code recebido`);
      session.qr = qr;
      session.status = 'QR_READY';
    });

    session.client.on('ready', () => {
      console.log(`[WhatsApp ${id}] Cliente pronto!`);
      session.status = 'READY';
      session.qr = null;
    });

    session.client.on('authenticated', () => {
      console.log(`[WhatsApp ${id}] Autenticado!`);
      session.status = 'AUTHENTICATED';
      session.qr = null;
    });

    session.client.on('disconnected', () => {
      console.log(`[WhatsApp ${id}] Desconectado!`);
      session.status = 'DISCONNECTED';
      session.qr = null;
      // Opcional: Destruir a sessão ao desconectar
      // this.stopSession(id);
    });

    // --- Lógica de Mensagens e IA ---
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

    session.client.on('message_create', async (msg) => {
      if (msg.fromMe) {
        if (msg.body.includes("Um atendente foi notificado")) return;
        try {
          const chat = await msg.getChat();
          const chatKey = `${id}_${chat.id._serialized}`;
          if (global.whatsappChatStates[chatKey]) {
            delete global.whatsappChatStates[chatKey];
            console.log(`[WhatsApp ${id}] Solicitação de ajuda atendida para ${chat.id._serialized}`);
          }
        } catch (e) {
          console.error(`[WhatsApp ${id}] Erro ao processar message_create:`, e);
        }
      }
    });

    session.client.on('message', async (msg) => {
      try {
        if (msg.from.includes('@g.us') || msg.from.includes('status@broadcast')) return;

        const chat = await msg.getChat();
        const chatKey = `${id}_${chat.id._serialized}`;
        const lowerBody = (msg.body || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const helpKeywords = ['atendente', 'humano', 'ajuda', 'suporte', 'falar com alguem', 'falar com atendente'];

        if (helpKeywords.some(keyword => lowerBody.includes(keyword))) {
          global.whatsappChatStates[chatKey] = { helpRequested: true, timestamp: Date.now() };
          await msg.reply("🔔 Um atendente foi notificado e falará com você em breve.");
          return;
        }

        if (global.whatsappChatStates[chatKey]?.helpRequested) return;

        const config = WhatsAppManager.getConfig(id);
        if (!config || config.isActive === false) return;

        await chat.sendStateTyping();
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
          const prompt = `
            Você é um agente virtual do restaurante "${config.nome || 'Jataí Food'}".
            Cardápio: ${config.cardapioLink || 'Solicite o link'}.
            Horário: ${config.horario || 'Consulte no perfil'}.
            Endereço: ${config.endereco || 'Consulte no perfil'}.
            Seja simpático, breve e use emojis.
            Cliente: "${msg.body}"
          `;

          const result = await model.generateContent(prompt);
          const response = await result.response;
          await msg.reply(response.text());
        } catch (aiError) {
          console.error(`[WhatsApp ${id}] Erro IA:`, aiError);
          const isGreeting = /^(oi|olá|ola|bom dia|boa tarde|boa noite)$/i.test(lowerBody);
          const fallback = isGreeting 
            ? (config.mensagemBoasVindas || `Olá! Bem-vindo ao ${config.nome || 'restaurante'}.`)
            : "Desculpe, não consegui entender. Poderia repetir?";
          await msg.reply(fallback);
        }
      } catch (error) {
        console.error(`[WhatsApp ${id}] Erro ao processar mensagem:`, error);
      }
    });

    try {
      await session.client.initialize();
    } catch (error) {
      console.error(`[WhatsApp ${id}] Erro ao inicializar:`, error);
      session.status = 'DISCONNECTED';
    }
  }

  static async stopSession(id: string): Promise<void> {
    const session = global.whatsappSessions[id];
    if (session && session.client) {
      try {
        await session.client.destroy();
      } catch (e) {
        console.error(`[WhatsApp ${id}] Erro ao destruir cliente:`, e);
      }
    }
    delete global.whatsappSessions[id];
  }

  static getStatus(id: string) {
    const session = global.whatsappSessions[id];
    if (!session) {
      return {
        status: 'DISCONNECTED',
        qr: null,
      };
    }
    return {
      status: session.status,
      qr: session.qr,
    };
  }

  static getClient(id: string): Client | null {
    return global.whatsappSessions[id]?.client || null;
  }

  static updateConfig(id: string, config: ConfigData) {
    global.whatsappConfigs[id] = { ...global.whatsappConfigs[id], ...config };
    console.log(`[WhatsApp ${id}] Configuração atualizada`);
  }

  static getConfig(id: string) {
    return global.whatsappConfigs[id] || {};
  }
}