import axios from 'axios';

let rawUrl = (process.env.REACT_APP_BACKEND_URL || '').trim();
if (rawUrl && !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
  rawUrl = `https://${rawUrl}`;
}
rawUrl = rawUrl.replace(/\/+$/, '');

export const api = axios.create({ baseURL: `${rawUrl}/api`, timeout: 20000 });
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(d => d.msg.replace('Value error, ', '')).join(' ');
    return 'Could not reach the server. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}