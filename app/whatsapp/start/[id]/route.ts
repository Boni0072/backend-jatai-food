// c:\Users\user\Desktop\BACKEND\app\whatsapp\start\[id]\route.ts

import { NextResponse } from 'next/server';
import { WhatsAppManager } from '@/lib/whatsapp'; // Verifique se o caminho do import está correto para o seu projeto

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    // Chama o método para iniciar a sessão
    await WhatsAppManager.startSession(id);

    return NextResponse.json({ message: 'Sessão iniciada', id }, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Permite qualquer origem (ajuste para produção se necessário)
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error("Erro ao iniciar sessão:", error);
    return NextResponse.json({ message: 'Erro ao iniciar sessão', error: String(error) }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
}

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
