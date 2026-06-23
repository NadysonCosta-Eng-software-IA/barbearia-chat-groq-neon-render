// 💡 Deixar string vazia em produção garante que o fetch use a mesma URL base do Render!
const API_URL = '';

const CONFIG = {
    MAX_HISTORY: 4,
    MIN_INTERVAL: 8000,
    MAX_REQUESTS_SESSION: 20,
    CACHE_DURATION: 300000,
    DEBOUNCE_DELAY: 1000,
    TYPING_TIMEOUT: 15000,
};

let chatOpen = false;
let chatHistory = [];
let requestCount = 0;
let lastRequestTime = 0;
let isProcessing = false;
let debounceTimer = null;
let responseCache = new Map();
let isRetryActive = false; // Bloqueador de loops infinitos no catch

window.dadosCliente = {
    nome: '',
    telefone: '',
    servico: '',
    profissional: '',
    horario: '',
    etapa: 'inicio'
};

// Navbar controller
window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
});

function toggleMenu() {
    document.getElementById('navLinks').classList.toggle('mobile-open');
}

// Fade in animation items
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// Formulário padrão institucional
function enviarFormulario() {
    const nome = document.getElementById('fname').value.trim();
    const tel = document.getElementById('fphone').value.trim();
    const servico = document.getElementById('fservice').value.trim();
    const msg = document.getElementById('fmsg').value.trim();
    
    if (!nome || !tel) {
        alert('Por favor, insira o seu nome e telefone.');
        return;
    }
    
    const numero = "5586994517396";
    const texto = `Olá! Solicitação de Agendamento:\n*Nome:* ${nome}\n*Telefone:* ${tel}\n*Serviço:* ${servico}\n*Data/Horário:* ${msg}`;
    
    document.getElementById('formSuccess').style.display = 'block';
    
    setTimeout(() => {
        document.getElementById('formSuccess').style.display = 'none';
        window.open(`https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}`, '_blank');
    }, 1000);
    
    fetch(`${API_URL}/api/agendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, telefone: tel, servico, profissional: 'Não especificado', horario: msg || 'A definir' })
    }).catch(err => console.log('Erro ao salvar agendamento:', err));
}

function enviarParaWhatsApp(dados) {
    const numeroWhats = "5586994517396";
    const mensagem = `*NOVO ATENDIMENTO VIA CHATBOT*\n\n` +
                    `👤 *Cliente:* ${dados.nome || 'Não informado'}\n` +
                    `📞 *Contato:* ${dados.telefone || 'Não informado'}\n` +
                    `✂️ *Serviço:* ${dados.servico || 'Não informado'}\n` +
                    `💈 *Profissional:* ${dados.profissional || 'Não informado'}\n` +
                    `⏰ *Horário:* ${dados.horario || 'Não informado'}\n` +
                    `🕐 *Atendimento:* ${new Date().toLocaleString('pt-BR')}`;
    
    window.open(`https://api.whatsapp.com/send?phone=${numeroWhats}&text=${encodeURIComponent(mensagem)}`, '_blank');
}

function detectarAgendamento(mensagem) {
    const msg = mensagem.toLowerCase();
    const palavras = ['agendar', 'marcar', 'horário', 'horario', 'quero um corte', 'marcar corte', 'agendar corte', 'agendamento'];
    return palavras.some(p => msg.includes(p));
}

function iniciarColetaDados() {
    window.dadosCliente.etapa = 'nome';
    addBotMessage('📋 Perfeito, vamos agendar! Para começar, digite o seu nome completo:');
}

function processarDadosCliente(mensagem) {
    const etapa = window.dadosCliente.etapa;
    
    switch(etapa) {
        case 'nome':
            window.dadosCliente.nome = mensagem;
            window.dadosCliente.etapa = 'telefone';
            addBotMessage(`Prazer, ${mensagem}! 👋 Agora, qual o seu telefone com DDD?`);
            return true;
            
        case 'telefone':
            if (mensagem.replace(/\D/g, '').length < 8) {
                addBotMessage('⚠️ Digite um número válido com DDD para contato. Ex: (86) 99999-0000');
                return true;
            }
            window.dadosCliente.telefone = mensagem;
            window.dadosCliente.etapa = 'servico';
            addBotMessage('Excelente! Selecione o serviço que deseja realizar: ✂️');
            mostrarBotoesServicos();
            return true;
            
        case 'servico':
            window.dadosCliente.servico = message;
            window.dadosCliente.etapa = 'profissional';
            addBotMessage('Deseja escolher algum profissional específico?');
            mostrarBotoesProfissionais();
            return true;
            
        case 'profissional':
            window.dadosCliente.profissional = mensagem;
            window.dadosCliente.etapa = 'horario';
            addBotMessage('Qual o melhor horário para você, campeão?');
            mostrarBotoesHorarios();
            return true;
            
        case 'horario':
            window.dadosCliente.horario = mensagem;
            window.dadosCliente.etapa = 'finalizado';
            
            const d = window.dadosCliente;
            addBotMessage(`📋 *Confirme os seus dados:*\n\n👤 Nome: ${d.nome}\n📞 Tel: ${d.telefone}\n✂️ Serviço: ${d.servico}\n💈 Barbeiro: ${d.profissional}\n⏰ Hora: ${d.horario}\n\nOs dados estão corretos?`);
            
            const msgsContainer = document.getElementById('chat-messages');
            const botoesDiv = document.createElement('div');
            botoesDiv.className = 'chat-buttons-group';
            
            const btnSim = document.createElement('button');
            btnSim.innerText = '✅ Confirmar!';
            btnSim.className = 'btn-chat-opcao';
            btnSim.onclick = () => { botoesDiv.remove(); finalizarAgendamento(); };
            
            const btnNao = document.createElement('button');
            btnNao.innerText = '🔄 Corrigir';
            btnNao.className = 'btn-chat-opcao';
            btnNao.onclick = () => { botoesDiv.remove(); resetarColeta(); addBotMessage('Vamos reiniciar. Digite seu nome completo:'); };
            
            botoesDiv.appendChild(btnSim);
            botoesDiv.appendChild(btnNao);
            msgsContainer.appendChild(botoesDiv);
            msgsContainer.scrollTop = msgsContainer.scrollHeight;
            return true;
    }
    return false;
}

function mostrarBotoesServicos() {
    const msgsContainer = document.getElementById('chat-messages');
    const botoesDiv = document.createElement('div');
    botoesDiv.className = 'chat-buttons-group';
    const servicos = ['Corte Clássico – R$ 45,00', 'Barba Completa – R$ 35,00', 'Combo Premium – R$ 90,00', 'Hidratação Capilar – R$ 55,00'];
    
    servicos.forEach(s => {
        const btn = document.createElement('button');
        btn.innerText = s;
        btn.className = 'btn-chat-opcao';
        btn.onclick = () => { botoesDiv.remove(); addUserMessage(s); processarDadosCliente(s); };
        botoesDiv.appendChild(btn);
    });
    msgsContainer.appendChild(botoesDiv);
    msgsContainer.scrollTop = msgsContainer.scrollHeight;
}

function mostrarBotoesProfissionais() {
    const msgsContainer = document.getElementById('chat-messages');
    const botoesDiv = document.createElement('div');
    botoesDiv.className = 'chat-buttons-group';
    const profissionais = ['Marcos Oliveira', 'Rafael Santos', 'Qualquer profissional'];
    
    profissionais.forEach(p => {
        const btn = document.createElement('button');
        btn.innerText = p;
        btn.className = 'btn-chat-opcao';
        btn.onclick = () => { botoesDiv.remove(); addUserMessage(p); processarDadosCliente(p); };
        botoesDiv.appendChild(btn);
    });
    msgsContainer.appendChild(botoesDiv);
    msgsContainer.scrollTop = msgsContainer.scrollHeight;
}

// Botões de horários
function mostrarBotoesHorarios() {
    const msgsContainer = document.getElementById('chat-messages');
    const botoesDiv = document.createElement('div');
    botoesDiv.className = 'chat-buttons-group';
    
    const horarios = ['09:00', '10:00', '14:00', '16:00', '17:00'];
    
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

async function finalizarAgendamento() {
    const d = window.dadosCliente;
    addBotMessage('✅ Salvando agendamento...');
    
    try {
        const res = await fetch(`${API_URL}/api/agendar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: d.nome, telefone: d.telefone, servico: d.servico, profissional: d.profissional, horario: d.horario })
        });
        const data = await res.json();
        if(data.sucesso) addBotMessage('💾 Registrado no banco de dados!');
        
        addBotMessage('📱 Redirecionando para o WhatsApp da barbearia...');
        setTimeout(() => { enviarParaWhatsApp(d); }, 1000);
    } catch (err) {
        console.error(err);
        addBotMessage('Vou abrir o canal de atendimento manual no WhatsApp para você!');
        setTimeout(() => { enviarParaWhatsApp(d); }, 1000);
    }
    resetarColeta();
}

function resetarColeta() {
    window.dadosCliente = { nome: '', telefone: '', servico: '', profissional: '', horario: '', etapa: 'inicio' };
}

function toggleChat() {
    chatOpen = !chatOpen;
    document.getElementById('chat-window').style.display = chatOpen ? 'flex' : 'none';
    
    if (chatOpen && chatHistory.length === 0) {
        addBotMessage('Olá! Sou o BarberBot da Barber Connect. 💈 Como posso te ajudar hoje?');
        addBotMessage('Diga *"Agendar"* para iniciar a marcação ou faça perguntas sobre nossos preços e serviços!');
    }
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    addUserMessage(text);
    document.getElementById('suggestions').style.display = 'none';
    
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { processarMensagem(text); }, CONFIG.DEBOUNCE_DELAY);
}

function sendSuggestion(text) {
    addUserMessage(text);
    document.getElementById('suggestions').style.display = 'none';
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { processarMensagem(text); }, CONFIG.DEBOUNCE_DELAY);
}

function processarMensagem(text) {
    if (window.dadosCliente.etapa !== 'inicio' && window.dadosCliente.etapa !== 'finalizado') {
        if (processarDadosCliente(text)) return;
    }
    
    if (detectarAgendamento(text) && window.dadosCliente.etapa === 'inicio') {
        iniciarColetaDados();
        return;
    }
    
    callGroq(text);
}

// 🚀 CHAMADA DE API UNIFICADA COM CONTRATO RESILIENTE
async function callGroq(text) {
    if (isProcessing) {
        addBotMessage('⏳ Aguarde o processamento anterior...');
        return;
    }
    
    if (requestCount >= CONFIG.MAX_REQUESTS_SESSION) {
        addBotMessage('🎯 Limite de mensagens atingido para esta sessão. Central de atendimento WhatsApp: (86) 9 9999-0001');
        return;
    }
    
    const now = Date.now();
    if (now - lastRequestTime < CONFIG.MIN_INTERVAL && lastRequestTime !== 0) {
        addBotMessage(`⏱️ Aguarde alguns segundos para enviar nova mensagem...`);
        return;
    }
    
    // Verificação de Cache Local do Front
    const cacheKey = text.toLowerCase().trim();
    if (responseCache.has(cacheKey)) {
        addBotMessage(responseCache.get(cacheKey).response);
        return;
    }
    
    isProcessing = true;
    lastRequestTime = now;
    requestCount++;
    showTyping();
    
    try {
        const res = await fetch(`${API_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        
        if (!res.ok) throw new Error(`Erro HTTP status ${res.status}`);
        
        const data = await res.json();
        removeTyping();
        addBotMessage(data.text);
        
        responseCache.set(cacheKey, { response: data.text, timestamp: now });
        isRetryActive = false; // Sucesso desativa trava
        
        // Disparar salvamento em segundo plano sem travar o usuário
        fetch(`${API_URL}/api/salvar-conversa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome: window.dadosCliente.nome || 'Cliente Chat',
                telefone: window.dadosCliente.telefone || 'Não informado',
                mensagem: text,
                resposta: data.text,
                tokens: data.tokens || 0
            })
        }).catch(e => console.log('Erro de log de salvamento:', e));
        
    } catch (err) {
        removeTyping();
        console.error('Erro na requisição:', err.message);
        
        // Bloqueio preventivo de loops infinitos no Catch
        if (!isRetryActive) {
            isRetryActive = true;
            addBotMessage('🔄 Servidor em repouso (Cold Start). Acordando a aplicação, aguarde...');
            setTimeout(() => { isProcessing = false; callGroq(text); }, 4000);
        } else {
            addBotMessage('Canal offline no momento. Fale conosco no WhatsApp: (86) 9 9999-0001 💬');
            isProcessing = false;
            isRetryActive = false;
        }
    } finally {
        if (!isRetryActive) isProcessing = false;
    }
}

function addBotMessage(text) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'message bot';
    msg.innerHTML = `<div class="msg-bubble">${text.replace(/\n/g, '<br>')}</div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

function addUserMessage(text) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `<div class="msg-bubble">${text}</div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

function showTyping() {
    const container = document.getElementById('chat-messages');
    const typing = document.createElement('div');
    typing.id = 'typing';
    typing.className = 'message bot';
    typing.innerHTML = `<div class="msg-bubble">☕ BarberBot está digitando...</div>`;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
}

function removeTyping() {
    const el = document.getElementById('typing');
    if (el) el.remove();
}
