import { NextResponse } from 'next/server';
import { WhatsAppManager } from '@/lib/whatsapp';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  await WhatsAppManager.stopSession(id);

  return NextResponse.json({ message: 'Sessão parada', id }, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
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