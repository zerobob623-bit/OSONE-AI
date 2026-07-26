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

    await new Promise(resolve => setTimeout(resolve, 800));

    return { 
      success: true, 
      message: "🧪 [MODO DEMONSTRAÇÃO] Credenciais cadastradas no ambiente local — nenhuma verificação com a nuvem do Google foi realizada. Nenhum dispositivo físico é controlado." 
    };
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
