// ⚠️ URL do backend no Render
//const API_URL = 'https://barber-connect-javascript.onrender.com';
const API_URL = 'http://localhost:3000';

// ═══════════════════════════════════════
// CONFIGURAÇÕES DE PROTEÇÃO
// ═══════════════════════════════════════
const CONFIG = {
    MAX_HISTORY: 4,
    MIN_INTERVAL: 8000,
    MAX_REQUESTS_SESSION: 20,
    CACHE_DURATION: 300000,
    DEBOUNCE_DELAY: 1000,
    TYPING_TIMEOUT: 15000,
};

// ═══════════════════════════════════════
// ESTADO GLOBAL CONTROLADO
// ═══════════════════════════════════════
let chatOpen = false;
let chatHistory = [];
let requestCount = 0;
let lastRequestTime = 0;
let isProcessing = false;
let debounceTimer = null;
let responseCache = new Map();

// ═══════════════════════════════════════
// SISTEMA DE COLETA DE DADOS DO CLIENTE
// ═══════════════════════════════════════
window.dadosCliente = {
    nome: '',
    telefone: '',
    servico: '',
    profissional: '',
    horario: '',
    etapa: 'inicio' // inicio, nome, telefone, servico, profissional, horario, finalizado
};

// ── NAVBAR SCROLL ──
window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// ── HAMBURGER ──
function toggleMenu() {
    document.getElementById('navLinks').classList.toggle('mobile-open');
}

// ── REVEAL ON SCROLL ──
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ── FORMULÁRIO → WhatsApp ──
function enviarFormulario() {
    const nome = document.getElementById('fname').value.trim();
    const tel = document.getElementById('fphone').value.trim();
    const servico = document.getElementById('fservice').value.trim();
    const msg = document.getElementById('fmsg').value.trim();
    
    if (!nome || !tel) {
        alert('Por favor, preencha ao menos nome e telefone.');
        return;
    }
    
    const numero = "5586994517396";
    const texto = `Olá! Gostaria de agendar:\n*Nome:* ${nome}\n*Telefone:* ${tel}\n*Serviço:* ${servico}\n*Data/Hora:* ${msg}`;
    
    document.getElementById('formSuccess').style.display = 'block';
    
    setTimeout(() => {
        document.getElementById('formSuccess').style.display = 'none';
        window.open(`https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}`, '_blank');
    }, 1000);
    
    // Também salva no banco
    fetch(`${API_URL}/api/agendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nome: nome,
            telefone: tel,
            servico: servico,
            profissional: 'Não especificado',
            horario: msg || 'A definir'
        })
    }).catch(err => console.log('Erro ao salvar agendamento:', err));
}

// ═══════════════════════════════════════
// FUNÇÃO PARA ENVIAR DADOS DO CHAT PARA WHATSAPP
// ═══════════════════════════════════════
function enviarParaWhatsApp(dadosCliente) {
    const numeroWhats = "5586994517396";
    
    const mensagem = `*NOVO ATENDIMENTO VIA CHATBOT*\n\n` +
                    `👤 *Cliente:* ${dadosCliente.nome || 'Não informado'}\n` +
                    `📞 *Contato:* ${dadosCliente.telefone || 'Não informado'}\n` +
                    `✂️ *Serviço:* ${dadosCliente.servico || 'Não informado'}\n` +
                    `💈 *Profissional:* ${dadosCliente.profissional || 'Não informado'}\n` +
                    `⏰ *Horário:* ${dadosCliente.horario || 'Não informado'}\n` +
                    `🕐 *Atendimento:* ${new Date().toLocaleString('pt-BR')}`;
    
    const link = `https://api.whatsapp.com/send?phone=${numeroWhats}&text=${encodeURIComponent(mensagem)}`;
    window.open(link, '_blank');
}

// ═══════════════════════════════════════
// SISTEMA DE COLETA DE DADOS
// ═══════════════════════════════════════

// Detecta intenção de agendamento
function detectarAgendamento(mensagem) {
    const msg = mensagem.toLowerCase();
    const palavras = ['agendar', 'marcar', 'horário', 'horario', 'quero um corte', 
                      'quero agendar', 'marcar corte', 'agendar corte', 'agendar barba',
                      'quero marcar', 'gostaria de agendar', 'agendamento'];
    return palavras.some(p => msg.includes(p));
}

// Inicia fluxo de coleta
function iniciarColetaDados() {
    window.dadosCliente.etapa = 'nome';
    addBotMessage('📋 Vamos agendar seu horário! Primeiro, qual o seu nome completo?');
}

// Processa dados do cliente por etapa
function processarDadosCliente(mensagem) {
    const etapa = window.dadosCliente.etapa;
    
    switch(etapa) {
        case 'nome':
            window.dadosCliente.nome = mensagem;
            window.dadosCliente.etapa = 'telefone';
            addBotMessage(`Prazer, ${mensagem}! 👋 Qual o seu telefone com DDD para contato? 📞`);
            return true;
            
        case 'telefone':
            // Aceita qualquer formato de telefone
            if (mensagem.replace(/\D/g, '').length < 8) {
                addBotMessage('⚠️ Por favor, digite um telefone válido com DDD. Ex: (86) 9 9999-0001');
                return true;
            }
            window.dadosCliente.telefone = mensagem;
            window.dadosCliente.etapa = 'servico';
            addBotMessage('Perfeito! Agora, qual serviço você deseja? Escolha uma das opções abaixo: ✂️');
            mostrarBotoesServicos();
            return true;
            
        case 'servico':
            window.dadosCliente.servico = mensagem;
            window.dadosCliente.etapa = 'profissional';
            addBotMessage('Tem preferência por algum profissional? Escolha abaixo ou diga "qualquer um": 💈');
            mostrarBotoesProfissionais();
            return true;
            
        case 'profissional':
            window.dadosCliente.profissional = mensagem;
            window.dadosCliente.etapa = 'horario';
            addBotMessage('E qual o melhor horário para você? Escolha uma opção: ⏰');
            mostrarBotoesHorarios();
            return true;
            
        case 'horario':
            window.dadosCliente.horario = mensagem;
            window.dadosCliente.etapa = 'finalizado';
            
            // Mostra resumo e confirma
            const d = window.dadosCliente;
            addBotMessage(`📋 *Confirme seus dados:*\n\n👤 Nome: ${d.nome}\n📞 Telefone: ${d.telefone}\n✂️ Serviço: ${d.servico}\n💈 Profissional: ${d.profissional}\n⏰ Horário: ${d.horario}\n\nEstá correto?`);
            
            // Botões de confirmação
            const msgsContainer = document.getElementById('chat-messages');
            const botoesDiv = document.createElement('div');
            botoesDiv.className = 'chat-buttons-group';
            
            const btnSim = document.createElement('button');
            btnSim.innerText = '✅ Sim, confirmar!';
            btnSim.className = 'btn-chat-opcao';
            btnSim.onclick = () => {
                botoesDiv.remove();
                finalizarAgendamento();
            };
            
            const btnNao = document.createElement('button');
            btnNao.innerText = '🔄 Corrigir dados';
            btnNao.className = 'btn-chat-opcao';
            btnNao.onclick = () => {
                botoesDiv.remove();
                resetarColeta();
                addBotMessage('Vamos recomeçar. Qual o seu nome? 📋');
            };
            
            botoesDiv.appendChild(btnSim);
            botoesDiv.appendChild(btnNao);
            msgsContainer.appendChild(botoesDiv);
            msgsContainer.scrollTop = msgsContainer.scrollHeight;
            return true;
    }
    return false;
}

// Botões de serviços
function mostrarBotoesServicos() {
    const msgsContainer = document.getElementById('chat-messages');
    const botoesDiv = document.createElement('div');
    botoesDiv.className = 'chat-buttons-group';
    
    const servicos = [
        'Corte Clássico – R$ 45,00',
        'Barba Completa – R$ 35,00',
        'Combo Premium – R$ 90,00',
        'Hidratação Capilar – R$ 55,00',
        'Luzes & Coloração – R$ 120,00',
        'Sobrancelha Design – R$ 20,00'
    ];
    
    servicos.forEach(servico => {
        const botao = document.createElement('button');
        botao.innerText = servico;
        botao.className = 'btn-chat-opcao';
        botao.onclick = () => {
            botoesDiv.remove();
            addUserMessage(servico);
            processarDadosCliente(servico);
        };
        botoesDiv.appendChild(botao);
    });
    
    msgsContainer.appendChild(botoesDiv);
    msgsContainer.scrollTop = msgsContainer.scrollHeight;
}

// Botões de profissionais
function mostrarBotoesProfissionais() {
    const msgsContainer = document.getElementById('chat-messages');
    const botoesDiv = document.createElement('div');
    botoesDiv.className = 'chat-buttons-group';
    
    const profissionais = [
        'Marcos Oliveira (Master)',
        'Rafael Santos (Sênior)',
        'Diego Costa (Colorista)',
        'Bruno Mendes (Esteticista)',
        'Qualquer um disponível'
    ];
    
    profissionais.forEach(prof => {
        const botao = document.createElement('button');
        botao.innerText = prof;
        botao.className = 'btn-chat-opcao';
        botao.onclick = () => {
            botoesDiv.remove();
            addUserMessage(prof);
            processarDadosCliente(prof);
        };
        botoesDiv.appendChild(botao);
    });
    
    msgsContainer.appendChild(botoesDiv);
    msgsContainer.scrollTop = msgsContainer.scrollHeight;
}

// Botões de horários
function mostrarBotoesHorarios() {
    const msgsContainer = document.getElementById('chat-messages');
    const botoesDiv = document.createElement('div');
    botoesDiv.className = 'chat-buttons-group';
    
    const horarios = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];
    
    horarios.forEach(hora => {
        const botao = document.createElement('button');
        botao.innerText = hora;
        botao.className = 'btn-chat-opcao';
        botao.onclick = () => {
            botoesDiv.remove();
            addUserMessage(hora);
            processarDadosCliente(hora);
        };
        botoesDiv.appendChild(botao);
    });
    
    msgsContainer.appendChild(botoesDiv);
    msgsContainer.scrollTop = msgsContainer.scrollHeight;
}

// Finalizar agendamento
async function finalizarAgendamento() {
    const d = window.dadosCliente;
    
    addBotMessage('✅ Agendamento confirmado! Salvando seus dados...');
    
    try {
        // Salva no banco de dados
        const res = await fetch(`${API_URL}/api/agendar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome: d.nome,
                telefone: d.telefone,
                servico: d.servico,
                profissional: d.profissional,
                horario: d.horario
            })
        });
        
        const data = await res.json();
        
        if (data.sucesso) {
            addBotMessage('💾 Dados salvos com sucesso!');
        }
        
        // Abre WhatsApp
        addBotMessage('📱 Abrindo WhatsApp para finalizar...');
        setTimeout(() => {
            enviarParaWhatsApp(d);
        }, 1000);
        
        // Mensagem final
        setTimeout(() => {
            addBotMessage('Prontinho, rei! Seu agendamento foi enviado. Em breve entraremos em contato para confirmar. Qualquer dúvida, é só chamar! 💈✨');
        }, 2000);
        
    } catch (err) {
        console.error('Erro ao finalizar:', err);
        addBotMessage('❌ Erro ao salvar. Mas não se preocupe, vou abrir o WhatsApp para você falar diretamente conosco!');
        setTimeout(() => {
            enviarParaWhatsApp(d);
        }, 1000);
    }
    
    // Resetar coleta
    resetarColeta();
}

// Resetar coleta de dados
function resetarColeta() {
    window.dadosCliente = {
        nome: '',
        telefone: '',
        servico: '',
        profissional: '',
        horario: '',
        etapa: 'inicio'
    };
}

// ══════════════════════════════════════════
// CHATBOT COM PROTEÇÕES
// ══════════════════════════════════════════

function toggleChat() {
    chatOpen = !chatOpen;
    const win = document.getElementById('chat-window');
    win.style.display = chatOpen ? 'flex' : 'none';
    
    const badge = document.getElementById('chat-badge');
    if (badge) badge.style.display = 'none';
    
    if (chatOpen && chatHistory.length === 0) {
        addBotMessage('Olá! Sou o BarberBot da Barber Connect. 💈\nComo posso te ajudar hoje?');
        addBotMessage('Você pode:\n• Digitar "agendar" para marcar um horário\n• Perguntar sobre serviços e preços\n• Conhecer nossa equipe');
    }
}

// ═══════════════════════════════════════
// FUNÇÃO PRINCIPAL COM DEBOUNCE
// ═══════════════════════════════════════
function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    input.value = '';
    addUserMessage(text);
    document.getElementById('suggestions').style.display = 'none';
    
    // Aplica debounce
    if (debounceTimer) clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(() => {
        processarMensagem(text);
    }, CONFIG.DEBOUNCE_DELAY);
}

// ═══════════════════════════════════════
// FUNÇÃO PARA SUGESTÕES RÁPIDAS
// ═══════════════════════════════════════
function sendSuggestion(text) {
    addUserMessage(text);
    document.getElementById('suggestions').style.display = 'none';
    
    if (debounceTimer) clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(() => {
        processarMensagem(text);
    }, CONFIG.DEBOUNCE_DELAY);
}

// ═══════════════════════════════════════
// PROCESSADOR PRINCIPAL DE MENSAGENS
// ═══════════════════════════════════════
function processarMensagem(text) {
    // Verifica se está em modo de coleta de dados
    if (window.dadosCliente.etapa !== 'inicio' && window.dadosCliente.etapa !== 'finalizado') {
        const processado = processarDadosCliente(text);
        if (processado) return;
    }
    
    // Detecta intenção de agendamento
    if (detectarAgendamento(text) && window.dadosCliente.etapa === 'inicio') {
        iniciarColetaDados();
        return;
    }
    
    // Se não for agendamento, chama a IA
    callGemini(text);
}

// ═══════════════════════════════════════
// CHAMADA À API COM TODAS AS PROTEÇÕES
// ═══════════════════════════════════════
async function callGemini(text) {
    if (isProcessing) {
        addBotMessage('⏳ Aguarde um momento, ainda estou processando sua mensagem anterior...');
        return;
    }
    
    if (requestCount >= CONFIG.MAX_REQUESTS_SESSION) {
        addBotMessage('🎯 Você atingiu o limite de mensagens desta sessão.');
        addBotMessage('Para continuar, recarregue a página ou fale conosco pelo WhatsApp: (86) 9 9999-0001 💬');
        return;
    }
    
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < CONFIG.MIN_INTERVAL && lastRequestTime !== 0) {
        const waitTime = Math.ceil((CONFIG.MIN_INTERVAL - timeSinceLastRequest) / 1000);
        addBotMessage(`⏱️ Para melhor atendimento, aguarde ${waitTime} segundos...`);
        return;
    }
    
    const cacheKey = text.toLowerCase().trim();
    if (responseCache.has(cacheKey)) {
        const cached = responseCache.get(cacheKey);
        if (now - cached.timestamp < CONFIG.CACHE_DURATION) {
            addBotMessage(cached.response);
            console.log('✅ Resposta do cache');
            return;
        } else {
            responseCache.delete(cacheKey);
        }
    }
    
    isProcessing = true;
    lastRequestTime = now;
    requestCount++;
    
    showTyping();
    
    const timeoutTimer = setTimeout(() => {
        const typing = document.getElementById('typing');
        if (typing) {
            typing.querySelector('.msg-bubble').textContent = '⏳ Servidor aquecendo...';
        }
    }, CONFIG.TYPING_TIMEOUT - 5000);
    
    try {
        const limitedHistory = chatHistory.slice(-CONFIG.MAX_HISTORY);
        
        console.log(`📊 Requisição #${requestCount}/${CONFIG.MAX_REQUESTS_SESSION}`);
        
        const res = await fetch(`${API_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                history: limitedHistory
            })
        });
        
        clearTimeout(timeoutTimer);
        
        if (!res.ok) {
            if (res.status === 429) throw new Error('Limite de requisições excedido.');
            throw new Error(`Erro HTTP ${res.status}`);
        }
        
        const data = await res.json();
        const botText = data.text || 'Desculpe, não consegui processar.';
        
        removeTyping();
        addBotMessage(botText);
        
        // 💾 Salvar conversa no banco
        const nomeCliente = window.dadosCliente.nome || 'Cliente Chat';
        const telefoneCliente = window.dadosCliente.telefone || 'Não informado';
        
        fetch(`${API_URL}/api/salvar-conversa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome: nomeCliente,
                telefone: telefoneCliente,
                mensagem: text,
                resposta: botText,
                tokens: data.tokens || 0
            })
        }).catch(err => console.log('💾 Erro ao salvar:', err));
        
        // Atualiza histórico
        chatHistory.push({ role: 'user', parts: [{ text }] });
        chatHistory.push({ role: 'model', parts: [{ text: botText }] });
        
        if (chatHistory.length > CONFIG.MAX_HISTORY * 2) {
            chatHistory = chatHistory.slice(-CONFIG.MAX_HISTORY * 2);
        }
        
        responseCache.set(cacheKey, { response: botText, timestamp: now });
        
        if (responseCache.size > 50) {
            const firstKey = responseCache.keys().next().value;
            responseCache.delete(firstKey);
        }
        
        console.log(`💾 Cache: ${responseCache.size} respostas`);
        
    } catch (err) {
        clearTimeout(timeoutTimer);
        removeTyping();
        
        console.error('❌ Erro:', err.message);
        
        if (err.message.includes('503') || err.message.includes('unavailable')) {
            addBotMessage('🔄 O servidor está um pouco ocupado. Tentando novamente...');
            setTimeout(async () => {
                try {
                    await callGemini(text);
                } catch (retryErr) {
                    addBotMessage('Desculpe, não foi possível completar. WhatsApp: (86) 9 9999-0001 💬');
                }
            }, 3000);
            return;
        }
        
        addBotMessage('Desculpe, estou temporariamente indisponível. 😕');
        addBotMessage('Você pode falar conosco pelo WhatsApp: (86) 9 9999-0001 💬');
        
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            lastRequestTime = 0;
        }
        
    } finally {
        isProcessing = false;
    }
}

// ═══════════════════════════════════════
// FUNÇÕES DE UI
// ═══════════════════════════════════════
function addBotMessage(text) {
    const msgs = document.getElementById('chat-messages');
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'msg msg-bot';
    div.innerHTML = `<div class="msg-bubble">${escapeHtml(text).replace(/\n/g, '<br>')}</div><div class="msg-time">${now}</div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

function addUserMessage(text) {
    const msgs = document.getElementById('chat-messages');
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'msg msg-user';
    div.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div><div class="msg-time">${now}</div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.id = 'typing';
    div.className = 'msg msg-bot';
    div.innerHTML = `<div class="msg-bubble typing-indicator"><span></span><span></span><span></span></div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() {
    const t = document.getElementById('typing');
    if (t) t.remove();
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function resetChat() {
    chatHistory = [];
    requestCount = 0;
    lastRequestTime = 0;
    isProcessing = false;
    responseCache.clear();
    resetarColeta();
    
    const msgs = document.getElementById('chat-messages');
    msgs.innerHTML = '';
    
    addBotMessage('Chat reiniciado! Como posso te ajudar? 💈');
}

console.log('🛡️ BarberBot Protegido Iniciado');
console.log('📋 Sistema de coleta de dados: ATIVO');
console.log('💾 Salvamento no banco: ATIVO');
console.log('📱 Integração WhatsApp: ATIVO');