import axios from 'axios';
import { apiPost, sessionHeaders } from './apiClient';
jest.mock('axios');
beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); });
test('creates one session and attaches its bearer token to requests', async () => {
  axios.post.mockResolvedValueOnce({ data: { token: 'session-token', expires_at: Date.now()/1000 + 3600 } });
  const headers = await sessionHeaders();
  expect(headers.Authorization).toBe('Bearer session-token');
  axios.post.mockResolvedValueOnce({ data: { answer: 'ok' } });
  await apiPost('/ask', { question: 'Q' });
  expect(axios.post).toHaveBeenLastCalledWith(expect.stringContaining('/ask'), {question:'Q'}, {headers});
  expect(axios.post).toHaveBeenCalledTimes(2);
});
