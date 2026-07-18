import { ApiKeys } from '../types';

export interface GoogleDevice {
  id: string;
  name: string;
  type: 'light' | 'thermostat' | 'lock' | 'speaker';
  status: 'online' | 'offline';
  traits: string[];
}

export const googleHomeService = {
  /**
   * Simula a autenticação com o Google Home Graph API
   */
  async verifyConnection(keys: ApiKeys): Promise<{ success: boolean; message: string; code?: string }> {
    if (!keys.googleHomeId || !keys.googleHomeToken) {
      return { success: false, message: "Project ID e Access Token são obrigatórios.", code: 'MISSING_FIELDS' };
    }

    // Simulação de delay de rede
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulação de token bloqueado por segurança (se for muito curto ou específico)
    if (keys.googleHomeToken === '123456') {
      return { 
        success: false, 
        message: "Acesso bloqueado por múltiplas tentativas falhas. Aguarde 5 minutos ou renove o token no Google Cloud Console.",
        code: 'SECURITY_BLOCK'
      };
    }

    if (keys.googleHomeToken.length < 5) {
      return { success: false, message: "Token de acesso muito curto. O token OAuth2 do Google geralmente possui mais de 40 caracteres.", code: 'INVALID_TOKEN' };
    }

    return { success: true, message: "Sincronização com Google Home concluída com sucesso. 3 dispositivos detectados." };
  },

  /**
   * Simula a busca de dispositivos vinculados ao Google Home
   */
  async getDevices(): Promise<GoogleDevice[]> {
    return [
      { id: 'g1', name: 'Luz da Cozinha', type: 'light', status: 'online', traits: ['OnOff', 'Brightness'] },
      { id: 'g2', name: 'Termostato Inteligente', type: 'thermostat', status: 'online', traits: ['TemperatureSetting'] },
      { id: 'g3', name: 'Alto-falante Quarto', type: 'speaker', status: 'offline', traits: ['Volume', 'MediaState'] },
    ];
  }
};
