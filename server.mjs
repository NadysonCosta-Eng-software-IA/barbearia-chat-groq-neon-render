import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import Groq from 'groq-sdk';
import pkg from 'pg';
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ═══════════════════════════════════════
// CONFIGURAÇÕES
// ═══════════════════════════════════════
const CONFIG = {
    MAX_REQUESTS_PER_MINUTE: 20,  // Groq permite 30/min
    CACHE_DURATION: 10 * 60 * 1000,
    REQUEST_TIMEOUT: 15000,
};

// Cache e Rate Limiter
const responseCache = new Map();
const rateLimiter = new Map();

// ═══════════════════════════════════════
// GROQ - MUITO MELHOR QUE GEMINI!
// ═══════════════════════════════════════
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ═══════════════════════════════════════
// CONEXÃO COM NEON DB
// ═══════════════════════════════════════
let pool = null;
let dbAtivo = false;

async function conectarNeonDB() {
    if (!process.env.DATABASE_URL) {
        console.log('⚠️ DATABASE_URL não encontrado no .env');
        console.log('💡 Chat funcionará sem salvar dados');
        return;
    }
    
    try {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 10000,
        });
        
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Neon DB conectado:', result.rows[0].now);
        dbAtivo = true;
        
        await criarTabelas();
    } catch (err) {
        console.error('❌ Erro Neon DB:', err.message);
        console.log('💡 O chat continuará funcionando normalmente');
        pool = null;
        dbAtivo = false;
    }
}

async function criarTabelas() {
    if (!dbAtivo || !pool) return;

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255),
                telefone VARCHAR(20) UNIQUE,
                email VARCHAR(255),
                primeira_visita TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ultima_visita TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS conversas (
                id SERIAL PRIMARY KEY,
                cliente_id INTEGER REFERENCES clientes(id),
                mensagem TEXT NOT NULL,
                resposta TEXT NOT NULL,
                tokens_usados INTEGER,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS agendamentos (
                id SERIAL PRIMARY KEY,
                cliente_id INTEGER REFERENCES clientes(id),
                nome VARCHAR(255) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                servico VARCHAR(255) NOT NULL,
                profissional VARCHAR(255),
                horario VARCHAR(50),
                status VARCHAR(50) DEFAULT 'pendente',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabelas criadas no Neon DB');
    } catch (err) {
        console.error('❌ Erro ao criar tabelas:', err.message);
        dbAtivo = false;
    }
}

conectarNeonDB();

// ═══════════════════════════════════════
// ROTA DO CHAT - COM GROQ (RESPOSTAS LONGAS!)
// ═══════════════════════════════════════
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { message } = req.body;
        
        if (!message || !message.trim()) {
            return res.status(400).json({ text: 'Digite uma mensagem.' });
        }
        
        // Rate limiting
        const clientIP = req.ip;
        const now = Date.now();
        const userRequests = rateLimiter.get(clientIP) || [];
        const recentRequests = userRequests.filter(t => now - t < 60000);
        
        if (recentRequests.length >= CONFIG.MAX_REQUESTS_PER_MINUTE) {
            return res.status(429).json({ text: 'Aguarde um momento...' });
        }
        
        recentRequests.push(now);
        rateLimiter.set(clientIP, recentRequests);
        
        // Cache
        const cacheKey = message.toLowerCase().trim();
        const cached = responseCache.get(cacheKey);
        if (cached && now - cached.timestamp < CONFIG.CACHE_DURATION) {
            console.log('✅ Cache hit');
            return res.json({ text: cached.response, cached: true });
        }
        
        console.log(`📨 "${message}"`);
        
        // 🚀 GROQ - Respostas completas e rápidas!
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `Você é o BarberBot, assistente virtual da Barber Connect em Teresina-PI.

Personalidade: Use "meu rei", "patrão", "meu caro", "campeão". Seja um barbeiro raiz, caloroso, bem humorado e profissional.

Serviços e preços:
- Corte Clássico: R$ 45,00 (40 min)
- Barba Completa: R$ 35,00 (30 min)
- Combo Premium (corte + barba + sobrancelha): R$ 90,00 (90 min)
- Hidratação Capilar: R$ 55,00 (45 min)
- Luzes & Coloração: R$ 120,00 (120 min)
- Sobrancelha Design: R$ 20,00 (15 min)

Equipe:
- Marcos Oliveira: Fundador & Master Barber (12 anos)
- Rafael Santos: Barber Sênior, especialista em fade (8 anos)
- Diego Costa: Colorista & Designer
- Bruno Mendes: Barber & Esteticista

Horários: Seg-Sex 9h-20h, Sáb 8h-18h, Dom fechado
Endereço: Av. Frei Serafim, 2352, Centro, Teresina-PI
WhatsApp: (86) 9 9999-0001
Instagram: @barberconnect

Regras:
1. Responda com 2-3 frases completas e bem elaboradas
2. SEMPRE termine cada frase com ponto final
3. Use emojis ocasionalmente (✂️💈✨)
4. Seja acolhedor e incentive agendamento via WhatsApp`
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            max_tokens: 150,
            temperature: 0.8,
            top_p: 0.9,
        });
        
        const botText = completion.choices[0].message.content;
        const tokensUsados = completion.usage?.total_tokens || 0;
        const duration = Date.now() - startTime;
        
        console.log(`✅ ${duration}ms | ${botText.length} caracteres | ${tokensUsados} tokens`);
        console.log(`📝 "${botText}"`);
        
        // Salva no cache
        responseCache.set(cacheKey, {
            response: botText,
            timestamp: now
        });
        
        // Limpa cache antigo
        if (responseCache.size > 100) {
            const firstKey = responseCache.keys().next().value;
            responseCache.delete(firstKey);
        }
        
        res.json({ text: botText, tokens: tokensUsados });
        
    } catch (err) {
        console.error('❌ Erro:', err.message);
        res.status(500).json({
            text: 'Estou temporariamente indisponível. WhatsApp: (86) 9 9999-0001 💬'
        });
    }
});

// ═══════════════════════════════════════
// ROTA SALVAR CONVERSA
// ═══════════════════════════════════════
app.post('/api/salvar-conversa', async (req, res) => {
    if (!dbAtivo || !pool) {
        return res.json({ sucesso: false, motivo: 'Banco de dados indisponível' });
    }
    
    const { nome, telefone, mensagem, resposta, tokens } = req.body;
    
    try {
        const clienteResult = await pool.query(
            `INSERT INTO clientes (nome, telefone) 
             VALUES ($1, $2) 
             ON CONFLICT (telefone) 
             DO UPDATE SET ultima_visita = CURRENT_TIMESTAMP 
             RETURNING id`,
            [nome || 'Cliente Chat', telefone || 'Não informado']
        );
        
        const clienteId = clienteResult.rows[0].id;
        
        await pool.query(
            `INSERT INTO conversas (cliente_id, mensagem, resposta, tokens_usados) 
             VALUES ($1, $2, $3, $4)`,
            [clienteId, mensagem, resposta, tokens || 0]
        );
        
        console.log('✅ Conversa salva no Neon - Cliente:', clienteId);
        res.json({ sucesso: true, cliente_id: clienteId });
        
    } catch (err) {
        console.error('❌ Erro ao salvar:', err);
        res.json({ sucesso: false, erro: err.message });
    }
});

// ═══════════════════════════════════════
// ROTA AGENDAMENTO
// ═══════════════════════════════════════
app.post('/api/agendar', async (req, res) => {
    const { nome, telefone, servico, profissional, horario } = req.body;
    
    // Sempre gera link WhatsApp
    const msg = `*NOVO AGENDAMENTO*\n👤 ${nome}\n📞 ${telefone}\n✂️ ${servico}\n💈 ${profissional || 'Não especificado'}\n⏰ ${horario || 'A definir'}`;
    const linkWhats = `https://api.whatsapp.com/send?phone=5586994517396&text=${encodeURIComponent(msg)}`;
    
    if (!dbAtivo || !pool) {
        return res.json({ 
            sucesso: false, 
            whatsapp_link: linkWhats 
        });
    }
    
    try {
        if (!nome || !telefone || !servico) {
            return res.status(400).json({ erro: 'Dados incompletos' });
        }
        
        const clienteResult = await pool.query(
            `INSERT INTO clientes (nome, telefone) 
             VALUES ($1, $2) 
             ON CONFLICT (telefone) 
             DO UPDATE SET ultima_visita = CURRENT_TIMESTAMP 
             RETURNING id`,
            [nome, telefone]
        );
        
        const clienteId = clienteResult.rows[0].id;
        
        const agendamentoResult = await pool.query(
            `INSERT INTO agendamentos (cliente_id, nome, telefone, servico, profissional, horario) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING id`,
            [clienteId, nome, telefone, servico, profissional || 'Não especificado', horario || 'A definir']
        );
        
        console.log('✅ Agendamento salvo - ID:', agendamentoResult.rows[0].id);
        
        res.json({ 
            sucesso: true, 
            agendamento_id: agendamentoResult.rows[0].id,
            whatsapp_link: linkWhats 
        });
        
    } catch (err) {
        console.error('❌ Erro ao agendar:', err);
        res.json({ 
            sucesso: false, 
            whatsapp_link: linkWhats 
        });
    }
});

// ═══════════════════════════════════════
// ROTA ADMIN
// ═══════════════════════════════════════
app.get('/api/admin/dados', async (req, res) => {
    if (!dbAtivo || !pool) {
        return res.json({ erro: 'Banco indisponível' });
    }
    
    try {
        const totalClientes = await pool.query('SELECT COUNT(*) as total FROM clientes');
        const totalConversas = await pool.query('SELECT COUNT(*) as total FROM conversas');
        const agendamentosPendentes = await pool.query("SELECT COUNT(*) as total FROM agendamentos WHERE status = 'pendente'");
        
        res.json({
            clientes: totalClientes.rows[0].total,
            conversas: totalConversas.rows[0].total,
            agendamentos_pendentes: agendamentosPendentes.rows[0].total
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar dados' });
    }
});

// ═══════════════════════════════════════
// ROTA DE STATUS
// ═══════════════════════════════════════
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        ia: 'Groq (Llama 3.3 70B)',
        cache: responseCache.size + ' itens',
        groq: !!process.env.GROQ_API_KEY ? 'configurado' : 'erro',
        banco_dados: dbAtivo ? 'Neon DB conectado' : 'indisponível',
    });
});

// ═══════════════════════════════════════
// INICIA SERVIDOR
// ═══════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('🚀 Barber Connect Server');
    console.log('📡 Porta:', PORT);
    console.log('🤖 IA: Groq (Llama 3.3 70B)');
    console.log('🔑 Groq:', process.env.GROQ_API_KEY ? '✅ OK' : '❌ FALTA');
    console.log('🗄️ Neon DB:', process.env.DATABASE_URL ? '✅ Configurado' : '❌ FALTA');
});