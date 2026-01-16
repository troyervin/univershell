import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth';
import { userRouter } from './routes/users';
import roleRouter from './routes/roles';
import { tenantRouter } from './routes/tenants';
import { tenantAdminRouter } from './routes/tenantAdmin';
import { scriptRouter } from './routes/scripts';
import { scriptGroupRouter } from './routes/scriptGroups';
import { workflowRouter } from './routes/workflows';
import { executionRouter } from './routes/executions';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/roles', roleRouter);
app.use('/api/tenants', tenantRouter);
app.use('/api/tenant-admin', tenantAdminRouter);
app.use('/api/scripts', scriptRouter);
app.use('/api/script-groups', scriptGroupRouter);
app.use('/api/workflows', workflowRouter);
app.use('/api/executions', executionRouter);

// Error handling
app.use(errorHandler);

app.listen(port, () => {
  console.log(`🚀 Univershell API server running on port ${port}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
