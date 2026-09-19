import axios from 'axios';
export const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`, timeout: 20000 });
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(d => d.msg.replace('Value error, ', '')).join(' ');
    return 'Could not reach the server. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}