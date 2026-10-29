import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()], build:{target:'es2022',chunkSizeWarningLimit:1200}, server:{proxy:{'/api':'http://127.0.0.1:9108'}}});
