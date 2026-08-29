import { io } from 'socket.io-client';

// Connect to the same origin since we're serving from Express
export const socket = io();
