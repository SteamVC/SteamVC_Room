import axios, { AxiosRequestConfig } from 'axios';

const AXIOS_INSTANCE = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  headers: {
    'Content-Type': 'application/json',
  },
});

// リクエストインターセプター
AXIOS_INSTANCE.interceptors.request.use(
  (config) => {
    // ここでトークンなどの認証情報を追加できます
    // const token = localStorage.getItem('token');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// レスポンスインターセプター
AXIOS_INSTANCE.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // エラーハンドリング
    if (error.response) {
      // サーバーがレスポンスを返した場合
      console.error('Response error:', error.response.status, error.response.data);
    } else if (error.request) {
      // リクエストが送信されたがレスポンスがない場合
      console.error('No response received:', error.request);
    } else {
      // リクエストの設定中にエラーが発生した場合
      console.error('Error setting up request:', error.message);
    }
    return Promise.reject(error);
  }
);

export const customAxiosInstance = <T>(
  config: AxiosRequestConfig
): Promise<T> => {
  const source = axios.CancelToken.source();
  const promise = AXIOS_INSTANCE({
    ...config,
    cancelToken: source.token,
  }).then(({ data }) => data);

  // @ts-ignore
  promise.cancel = () => {
    source.cancel('Query was cancelled');
  };

  return promise;
};

export default customAxiosInstance;
