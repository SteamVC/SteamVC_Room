import { defineConfig } from 'orval';

export default defineConfig({
  roomApi: {
    input: {
      target: '../backend/api/docs/room.swagger.json',
    },
    output: {
      mode: 'tags-split',
      target: './src/api/generated/room.ts',
      schemas: './src/api/generated/models',
      client: 'axios',
      mock: false,
      override: {
        mutator: {
          path: './src/api/axios-instance.ts',
          name: 'customAxiosInstance',
        },
      },
    },
  },
});
