import { Client, LocalAuth } from 'whatsapp-web.js';

// Interface para armazenar o estado de cada sessão
interface SessionData {
  client: Client;
  qr: string | null;
  status: 'INITIALIZING' | 'QR_READY' | 'AUTHENTICATED' | 'READY' | 'DISCONNECTED';
}

// Estende o objeto global para manter as sessões em memória (evita recriação no hot-reload)
declare global {
  var whatsappSessions: { [key: string]: SessionData };
}

if (!global.whatsappSessions) {
  global.whatsappSessions = {};
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
}