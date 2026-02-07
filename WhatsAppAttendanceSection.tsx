'use client';

import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

export default function WhatsAppAttendanceSection() {
  const [username] = useState('A');
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const [status, setStatus] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverMessage, setServerMessage] = useState('');

  const connectWhatsApp = async () => {
    try {
      setLoading(true);
      setQr(null);

      const response = await fetch(`${API_BASE}/api/whatsapp/start/${username}`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Falha ao iniciar');

      setServerMessage('Iniciando sessão...');
    } catch (err) {
      console.error(err);
      setServerMessage('Erro: Backend offline ou inacessível.');
    } finally {
      setLoading(false);
    }
  };

  async function checkConnectionStatus() {
    try {
      const response = await fetch(`${API_BASE}/api/whatsapp/status/${username}`);
      
      if (!response.ok) {
        throw new Error('Erro na resposta do servidor');
      }

      const data = await response.json();

      setStatus(data.status);
      setServerMessage(''); // Limpa mensagens de erro se conectar com sucesso

      if ((data.status === 'qr' || data.status === 'QR_CODE') && data.qr) {
        setQr(data.qr);
      } else {
        setQr(null);
      }
    } catch (error) {
      // Não marcamos como offline total para continuar tentando, mas avisamos no console
      console.log('Tentando reconectar ao backend...');
      setStatus('offline');
    }
  }

  useEffect(() => {
    checkConnectionStatus();
    // Polling a cada 5 segundos, independente de estar offline ou não
    const i = setInterval(checkConnectionStatus, 5000);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>WhatsApp Atendimento</h2>

      {/* Botão de Conexão Manual */}
      <button onClick={connectWhatsApp} disabled={loading}>
        {loading ? 'Iniciando...' : 'Iniciar / Reiniciar WhatsApp'}
      </button>

      {/* Exibição de Status e Erros */}
      <div style={{ marginTop: 10, marginBottom: 10 }}>
        <strong>Status: </strong>
        {status === 'offline' ? (
          <span style={{ color: 'red' }}>🔴 Backend Offline (Verifique o terminal do servidor)</span>
        ) : status === 'initializing' ? (
          <span style={{ color: 'orange' }}>🟡 Iniciando... Aguarde o QR Code</span>
        ) : (status === 'qr' || status === 'QR_CODE') ? (
          <span style={{ color: 'blue' }}>🔵 Aguardando Leitura</span>
        ) : status === 'ready' ? (
          <span style={{ color: 'green' }}>🟢 Conectado e Pronto</span>
        ) : (
          <span>{status || 'Desconhecido'}</span>
        )}
      </div>

      {serverMessage && <p style={{ color: '#666', fontSize: '0.9em' }}>{serverMessage}</p>}

      {(status === 'qr' || status === 'QR_CODE') && qr && (
        <div
          style={{
            marginTop: 20,
            background: '#fff',
            padding: 20,
            borderRadius: 12,
            display: 'inline-block',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}
        >
          <h3>Escaneie o QR Code</h3>

          <div
            style={{
              marginTop: 10,
              background: 'white',
              padding: 10,
            }}
          >
            <QRCodeCanvas
              key={qr}
              value={qr}
              size={250}
              bgColor="#ffffff"
              fgColor="#000000"
              level="L"
              includeMargin={true}
            />
          </div>

          <p style={{ fontSize: 12, marginTop: 10 }}>
            WhatsApp → Dispositivos conectados
          </p>
        </div>
      )}

      {status === 'ready' && <p>✅ WhatsApp conectado!</p>}
    </div>
  );
}
