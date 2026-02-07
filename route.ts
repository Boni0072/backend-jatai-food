import { NextResponse } from 'next/server';
import { WhatsAppManager } from '@/lib/whatsapp';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  await WhatsAppManager.stopSession(id);

  return NextResponse.json({ message: 'Sessão parada', id });
}