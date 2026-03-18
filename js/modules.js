const Modules = {
    currentFilterMonth: new Date().toISOString().slice(0, 7),

    changeFilterMonth(offset, viewToRender) {
        let [year, month] = this.currentFilterMonth.split('-');
        let d = new Date(year, parseInt(month) - 1 + offset, 1);
        this.currentFilterMonth = d.toISOString().slice(0, 7);
        if (viewToRender === 'list') this.list.render();
        if (viewToRender === 'dashboard') this.dashboard.render();
    },

    // --- MÓDULO DE CALENDÁRIO ---
    calendar: {
        selectedStatus: 'worked',
        tempExpenses: [], 
        
        render() {
            const container = document.getElementById('app-content');
            container.innerHTML = `<div id="calendar-scroll-container" class="calendar-wrapper"></div>`;
            const now = new Date();
            for (let i = -1; i <= 3; i++) {
                this.renderMonth(now.getFullYear(), now.getMonth() + i);
            }
            setTimeout(() => this.setupScrollObserver(), 150);
        },

        setupScrollObserver() {
            const observerOptions = { threshold: 0, rootMargin: '-40% 0px -59% 0px' };
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const visibleMonth = entry.target.dataset.yearMonth;
                        if (app.state.visibleMonth !== visibleMonth) {
                            app.state.visibleMonth = visibleMonth;
                            app.updateSummary();
                        }
                    }
                });
            }, observerOptions);
            document.querySelectorAll('.month-section').forEach(sec => observer.observe(sec));
        },

        renderMonth(year, month) {
            const date = new Date(year, month, 1);
            const monthName = date.toLocaleString('pt-br', { month: 'long' });
            const yearNum = date.getFullYear();

            const monthCard = document.createElement('div');
            monthCard.className = 'month-section';
            monthCard.dataset.yearMonth = `${yearNum}-${String(month + 1).padStart(2, '0')}`;
            monthCard.innerHTML = `<h3 class="month-title">${monthName} <small>${yearNum}</small></h3><div class="calendar-grid" id="grid-${yearNum}-${month}"></div>`;
            document.getElementById('calendar-scroll-container').appendChild(monthCard);
            this.fillDays(yearNum, month);
        },

        fillDays(year, month) {
            const grid = document.getElementById(`grid-${year}-${month}`);
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="day-cell empty"></div>`;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const statusClass = this.getSmartDayStatus(year, month, day, dateKey);
                grid.innerHTML += `<div class="day-cell ${statusClass}" onclick="Modules.calendar.openDay('${dateKey}', '${statusClass}')">${day}</div>`;
            }
        },

        getSmartDayStatus(year, month, day, dateKey) {
            const entry = app.state.data.entries[dateKey];
            if (entry && entry.status) return entry.status;

            const jobs = app.state.data.jobs || [{ scaleType: 'none' }];
            const mainJob = jobs[0];

            if (!mainJob.scaleType || mainJob.scaleType === 'none' || !mainJob.scaleStart) return '';

            const [sYear, sMonth, sDay] = mainJob.scaleStart.split('-');
            const utcCurrent = Date.UTC(year, month, day);
            const utcStart = Date.UTC(sYear, sMonth - 1, sDay);
            
            if (utcCurrent < utcStart) return '';
            const diffDays = Math.floor((utcCurrent - utcStart) / 86400000);

            if (mainJob.scaleType === '12x36') return (diffDays % 2 === 0) ? 'planned' : '';
            if (mainJob.scaleType === '24x48') return (diffDays % 3 === 0) ? 'planned' : '';
            if (mainJob.scaleType === '6x1') return (diffDays % 7 !== 6) ? 'planned' : ''; 
            if (mainJob.scaleType === '5x2') {
                const dow = new Date(year, month, day).getDay();
                return (dow >= 1 && dow <= 5) ? 'planned' : '';
            }
            return '';
        },

        openDay(dateKey, projectedStatus) {
            const entry = app.state.data.entries[dateKey] || { status: projectedStatus, value: '', expensesList: [] };
            this.selectedStatus = entry.status || 'worked'; 
            this.tempExpenses = entry.expensesList ? [...entry.expensesList] : []; 
            
            const jobs = app.state.data.jobs || [{ baseSalary: 0 }];
            const mainJob = jobs[0];
            const [year, month] = dateKey.split('-');
            const stats = Modules.settings.getWorkDaysStats(year, month - 1, mainJob.scaleType, mainJob.scaleStart);
            const dailyRate = mainJob.baseSalary > 0 ? (mainJob.baseSalary / (stats.full || 1)).toFixed(2) : '';

            const html = `
                <button class="btn-close-modal" onclick="UI.closeModal()">✕</button>
                <div class="modal-header">
                    <h3>${dateKey.split('-').reverse().join('/')}</h3>
                    <p>Registro de Diária</p>
                </div>

                <div class="status-selector">
                    <button class="seg-btn ${this.selectedStatus === 'worked' ? 'active worked' : ''}" onclick="Modules.calendar.setStatus('worked', this)">Trabalhado</button>
                    <button class="seg-btn ${this.selectedStatus === 'off' ? 'active off' : ''}" onclick="Modules.calendar.setStatus('off', this)">Folga</button>
                    <button class="seg-btn ${this.selectedStatus === 'planned' ? 'active planned' : ''}" onclick="Modules.calendar.setStatus('planned', this)">Agendado</button>
                    ${this.selectedStatus === 'transferred' ? `<button class="seg-btn active transferred" onclick="Modules.calendar.setStatus('transferred', this)">Transferido</button>` : ''}
                </div>

                <div class="row-compact">
                    <div class="form-group">
                        <label>Valor Bruto (R$)</label>
                        <input type="number" id="input-value" value="${entry.value || dailyRate}" step="0.01" placeholder="${dailyRate}">
                    </div>
                    ${this.selectedStatus !== 'transferred' ? `<button class="btn-icon" onclick="Modules.calendar.toggleTransferCalendar('${dateKey}')">🔁 Transferir</button>` : ''}
                </div>
                
                <div id="transfer-calendar-area" class="transfer-calendar"></div>

                <div class="expense-box">
                    <div class="expense-box-header">
                        <strong>Quadro de Despesas</strong>
                        <span class="expense-total" id="expense-total-display">R$ 0,00</span>
                    </div>
                    <div class="expense-list" id="expense-list-container"></div>
                    <div class="expense-add-row">
                        <input type="text" id="exp-desc" placeholder="Ex: Almoço" style="flex: 2;">
                        <input type="number" id="exp-val" placeholder="R$" style="flex: 1;" step="0.01">
                        <button class="btn-add-expense" onclick="Modules.calendar.addTempExpense()">+</button>
                    </div>
                </div>

                <button class="btn-save" onclick="Modules.calendar.saveDay('${dateKey}')">Salvar Alterações</button>
                <button class="btn-clear" onclick="Modules.calendar.clearDay('${dateKey}')">🗑️ Remover Registro</button>
            `;
            UI.openModal(html);
            this.renderTempExpenses(); 
        },

        setStatus(status, btnElement) {
            this.selectedStatus = status;
            document.querySelectorAll('.seg-btn').forEach(btn => btn.className = 'seg-btn');
            btnElement.className = `seg-btn active ${status}`;
        },

        addTempExpense() {
            const desc = document.getElementById('exp-desc').value;
            const val = parseFloat(document.getElementById('exp-val').value);
            if (!desc || isNaN(val)) return alert("Preencha descrição e valor da despesa.");
            this.tempExpenses.push({ desc, value: val });
            document.getElementById('exp-desc').value = '';
            document.getElementById('exp-val').value = '';
            this.renderTempExpenses();
        },

        removeTempExpense(index) {
            this.tempExpenses.splice(index, 1);
            this.renderTempExpenses();
        },

        renderTempExpenses() {
            const container = document.getElementById('expense-list-container');
            const totalDisplay = document.getElementById('expense-total-display');
            let total = 0;
            container.innerHTML = '';
            
            if (this.tempExpenses.length === 0) {
                container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; text-align: center;">Nenhuma despesa lançada.</p>';
            } else {
                this.tempExpenses.forEach((exp, i) => {
                    total += exp.value;
                    container.innerHTML += `
                        <div class="expense-item"><span>${exp.desc}</span>
                        <div><strong>R$ ${exp.value.toFixed(2)}</strong> <button onclick="Modules.calendar.removeTempExpense(${i})">✕</button></div></div>
                    `;
                });
            }
            totalDisplay.innerText = `R$ ${total.toFixed(2)}`;
        },

        toggleTransferCalendar(currentDateKey) {
            const area = document.getElementById('transfer-calendar-area');
            if (area.classList.contains('visible')) { area.classList.remove('visible'); return; }
            area.classList.add('visible');
            this.renderTransferCalendar(currentDateKey);
        },

        renderTransferCalendar(fromDateKey) {
            const area = document.getElementById('transfer-calendar-area');
            const now = new Date();
            const year = now.getFullYear(); const month = now.getMonth();
            const totalDays = new Date(year, month + 1, 0).getDate();
            const startDayDow = new Date(year, month, 1).getDay();

            let html = `
                <div class="t-header"><strong style="font-size: 0.9rem;">Dias Livres no Mês:</strong>
                <button class="btn-clear" style="margin:0; padding: 5px 10px;" onclick="Modules.calendar.toggleTransferCalendar()">Ocultar</button></div>
                <div class="t-grid">
            `;

            for (let i = 0; i < startDayDow; i++) html += '<div class="t-day empty"></div>';

            for (let day = 1; day <= totalDays; day++) {
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const utcCurrent = Date.UTC(year, month, day);
                const utcToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

                const isPast = utcCurrent < utcToday;
                const entry = app.state.data.entries[dateKey];
                const dynamicStatus = this.getSmartDayStatus(year, month, day, dateKey);

                let isBusy = false;
                if (entry && entry.status) isBusy = true;
                if (dynamicStatus === 'planned') isBusy = true;

                let classes = 't-day'; let action = '';
                
                if (isPast) classes += ' past';
                else if (isBusy) classes += ' busy';
                else { 
                    classes += ' free'; 
                    action = `onclick="Modules.calendar.moveDay('${fromDateKey}', '${dateKey}')"`; 
                }

                html += `<div class="${classes}" ${action}>${day}</div>`;
            }
            area.innerHTML = html + '</div>';
        },

        moveDay(fromKey, toKey) {
            Storage.saveEntry(toKey, { status: 'planned', value: '', expenses: 0, expensesList: [] });
            Storage.saveEntry(fromKey, { status: 'transferred', value: 0, expenses: 0, expensesList: [] });
            
            app.state.data = Storage.getData();
            UI.closeModal();
            app.navigate(app.state.currentView);
        },

        saveDay(dateKey) {
            const value = parseFloat(document.getElementById('input-value').value) || 0;
            const expensesList = [...this.tempExpenses];
            const expensesTotal = expensesList.reduce((acc, curr) => acc + curr.value, 0);
            
            Storage.saveEntry(dateKey, { status: this.selectedStatus, value, expenses: expensesTotal, expensesList });
            app.state.data = Storage.getData();
            UI.closeModal();
            app.navigate(app.state.currentView);
        },

        clearDay(dateKey) {
            if(app.state.data.entries[dateKey]) {
                delete app.state.data.entries[dateKey];
                localStorage.setItem('@diarias_pro_data', JSON.stringify(app.state.data));
            }
            UI.closeModal();
            app.navigate(app.state.currentView);
        }
    },

    // --- MÓDULO DE LISTA E EXPORTAÇÃO PDF ---
    list: {
        render() {
            const container = document.getElementById('app-content');
            const entries = app.state.data.entries || {};
            const filterMonth = Modules.currentFilterMonth;
            
            const [y, m] = filterMonth.split('-');
            const monthName = new Date(y, m - 1, 1).toLocaleString('pt-br', { month: 'long', year: 'numeric' });

            const statusTranslate = { 'worked': 'Trabalhado', 'off': 'Folga', 'planned': 'Agendado', 'transferred': 'Transferido' };

            let html = `
                <div class="list-container">
                    <button class="btn-export-pdf" onclick="Modules.list.exportPDF('${filterMonth}')">📄 Exportar Fechamento de ${monthName}</button>

                    <div class="month-filter-nav">
                        <button onclick="Modules.changeFilterMonth(-1, 'list')">←</button>
                        <span>${monthName}</span>
                        <button onclick="Modules.changeFilterMonth(1, 'list')">→</button>
                    </div>
            `;

            const sortedDates = Object.keys(entries)
                .filter(date => date.startsWith(filterMonth))
                .sort((a, b) => new Date(b) - new Date(a));

            if (sortedDates.length === 0) html += `<p class="empty-msg">Nenhum registro encontrado.</p>`;

            sortedDates.forEach(date => {
                const item = entries[date];
                const statusValue = item.status || 'worked'; 
                
                const net = (item.value || 0) - (item.expenses || 0);
                let badgeClass = net >= 0 ? 'high-profit' : 'loss';
                
                const labelPT = statusTranslate[statusValue] || statusValue.toUpperCase();

                html += `
                    <div class="card-diaria ${statusValue}" onclick="Modules.calendar.openDay('${date}', '${statusValue}')">
                        <div class="card-info">
                            <span class="card-date">${date.split('-').reverse().join('/')}</span>
                            <span class="card-status-label">${labelPT.toUpperCase()}</span>
                        </div>
                        <div class="card-values">
                            <div><small>Bruto:</small> <b>R$ ${(item.value || 0).toFixed(2)}</b></div>
                            <div><small>Gastos:</small> <b class="text-danger">R$ ${(item.expenses || 0).toFixed(2)}</b></div>
                            <div class="card-net"><small>Líquido:</small> <span class="${badgeClass}">R$ ${net.toFixed(2)}</span></div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html + `</div>`;
        },

        exportPDF(monthKey) {
            const entries = app.state.data.entries || {};
            const [yearStr, monthStr] = monthKey.split('-');
            const year = parseInt(yearStr);
            const monthNum = parseInt(monthStr) - 1; 
            const monthName = new Date(year, monthNum, 1).toLocaleString('pt-br', { month: 'long', year: 'numeric' });
            const daysInMonth = new Date(year, monthNum + 1, 0).getDate();

            const jobs = app.state.data.jobs || [{ baseSalary: 1, scaleType: 'none', scaleStart: '' }];
            const mainJob = jobs[0];
            const stats = Modules.settings.getWorkDaysStats(year, monthNum, mainJob.scaleType, mainJob.scaleStart);
            const baseDailyRate = mainJob.baseSalary > 0 ? (mainJob.baseSalary / (stats.full || 1)) : 0;

            let diasTrabalhados = 0; let diasFolga = 0; let diasPlanejados = 0;
            let totalGastos = 0; let totalLiquido = 0;
            
            let tableHTML = `
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; font-family: sans-serif;">
                    <thead>
                        <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                            <th style="padding: 10px; text-align: left;">Data</th>
                            <th style="padding: 10px; text-align: left;">Status</th>
                            <th style="padding: 10px; text-align: right;">Vl. Diária</th>
                            <th style="padding: 10px; text-align: right;">Gastos</th>
                            <th style="padding: 10px; text-align: right;">Líquido</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            const translatePDF = { 'worked': 'Trabalhado', 'off': 'Folga', 'planned': 'Não Executado', 'transferred': 'Transferido' };
            let hasRecords = false;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateKey = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
                const status = Modules.calendar.getSmartDayStatus(year, monthNum, day, dateKey);
                
                if (status) {
                    hasRecords = true;
                    const entry = entries[dateKey] || {};
                    
                    if (status === 'worked') diasTrabalhados++;
                    else if (status === 'off') diasFolga++;
                    else if (status === 'planned') diasPlanejados++;

                    let vlDiaria = 0;
                    let liquido = 0;
                    let gastos = parseFloat(entry.expenses) || 0;

                    if (status === 'worked') {
                        vlDiaria = entry.value !== undefined && entry.value !== '' ? parseFloat(entry.value) : baseDailyRate;
                        liquido = vlDiaria; 
                    } else if (status === 'off' || status === 'planned' || status === 'transferred') {
                        vlDiaria = 0;
                        liquido = 0;
                    }

                    totalGastos += gastos;
                    totalLiquido += liquido;

                    tableHTML += `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 8px;">${String(day).padStart(2, '0')}/${monthStr}/${yearStr}</td>
                            <td style="padding: 8px;">${translatePDF[status] || status}</td>
                            <td style="padding: 8px; text-align: right;">R$ ${vlDiaria.toFixed(2)}</td>
                            <td style="padding: 8px; text-align: right; color: #dc2626;">R$ ${gastos.toFixed(2)}</td>
                            <td style="padding: 8px; text-align: right; font-weight: bold;">R$ ${liquido.toFixed(2)}</td>
                        </tr>
                    `;
                }
            }
            tableHTML += `</tbody></table>`;

            if(!hasRecords) return alert("Não há registros ou dias programados na escala neste mês para exportar.");

            const pdfContainer = document.createElement('div');
            pdfContainer.innerHTML = `
                <div style="padding: 40px; font-family: 'Helvetica', sans-serif; color: #333;">
                    <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px;">
                        <h1 style="color: #2563eb; margin: 0;">Relatório de Fechamento de Diárias</h1>
                        <h3 style="color: #64748b; margin-top: 5px; text-transform: capitalize;">Mês de Referência: ${monthName}</h3>
                    </div>

                    <div style="display: flex; justify-content: space-between; margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 8px;">
                        <div>
                            <p style="margin: 5px 0;"><strong>Valor da Diária Base:</strong> R$ ${baseDailyRate.toFixed(2)}</p>
                            <p style="margin: 5px 0;"><strong>Dias Trabalhados:</strong> ${diasTrabalhados}</p>
                            <p style="margin: 5px 0;"><strong>Não Executados / Folgas:</strong> ${diasPlanejados} / ${diasFolga}</p>
                        </div>
                        <div style="text-align: right;">
                            <p style="margin: 5px 0; color: #dc2626;"><strong>Total de Custos (Informativo):</strong> R$ ${totalGastos.toFixed(2)}</p>
                            <h2 style="margin: 10px 0 0 0; color: #16a34a;">Líquido Final: R$ ${totalLiquido.toFixed(2)}</h2>
                        </div>
                    </div>

                    <h4 style="margin-bottom: 10px; color: #475569;">Extrato Detalhado de Diárias</h4>
                    ${tableHTML}
                    
                    <p style="text-align: center; margin-top: 50px; font-size: 10px; color: #94a3b8;">Gerado via Controle de Diárias Pro</p>
                </div>
            `;

            const configuracoesPDF = {
                margin: 5,
                filename: `Fechamento_${monthKey}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, logging: false }, 
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            alert("Gerando Relatório... Isso pode levar alguns segundos.");
            html2pdf().set(configuracoesPDF).from(pdfContainer).save().then(() => { alert("✅ PDF gerado com sucesso!"); });
        }
    },

    dashboard: {
        render() {
            const container = document.getElementById('app-content');
            const entries = app.state.data.entries || {};
            const jobs = app.state.data.jobs || [{ baseSalary: 1 }];
            const mainJob = jobs[0];
            
            const filterMonth = Modules.currentFilterMonth;
            const [y, m] = filterMonth.split('-');
            const monthName = new Date(y, m - 1, 1).toLocaleString('pt-br', { month: 'long', year: 'numeric' });

            let currentNet = 0; let currentGross = 0; let currentExp = 0;
            let diasTrabalhados = 0; let diasFolga = 0;
            
            Object.entries(entries).forEach(([dateKey, entry]) => {
                if (dateKey.startsWith(filterMonth)) {
                    if (entry.status === 'worked') {
                        diasTrabalhados++;
                        currentGross += (entry.value || 0);
                        currentExp += (entry.expenses || 0);
                        currentNet += (entry.value || 0) - (entry.expenses || 0);
                    } else if (entry.status === 'off') diasFolga++;
                }
            });

            const target = mainJob.baseSalary || 1;
            let percent = ((currentNet / target) * 100).toFixed(0);
            if (percent > 100) percent = 100;
            if (percent < 0) percent = 0;

            container.innerHTML = `
                <div class="dashboard-container">
                    <div class="month-filter-nav">
                        <button onclick="Modules.changeFilterMonth(-1, 'dashboard')">←</button>
                        <span>${monthName}</span>
                        <button onclick="Modules.changeFilterMonth(1, 'dashboard')">→</button>
                    </div>
                    
                    <div class="dashboard-card">
                        <h3>Progresso da Meta</h3>
                        <p style="color: var(--text-muted); margin-bottom: 15px;">Objetivo: R$ ${target.toLocaleString('pt-BR')}</p>
                        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${percent}%;"></div></div>
                        <h1 style="text-align: right; margin-top: 10px; color: var(--primary);">${percent}%</h1>
                    </div>
                    
                    <div class="dashboard-card">
                        <h3>Raio-X do Mês</h3>
                        <div class="stats-grid">
                            <div class="stat-box"><h4>Ganhos</h4><span style="color: var(--success)">R$ ${currentGross.toFixed(0)}</span></div>
                            <div class="stat-box"><h4>Despesas</h4><span style="color: var(--danger)">R$ ${currentExp.toFixed(0)}</span></div>
                            <div class="stat-box"><h4>Líquido</h4><span>R$ ${currentNet.toFixed(0)}</span></div>
                            <div class="stat-box"><h4>Trabalho</h4><span style="color: var(--primary)">${diasTrabalhados} dias</span></div>
                            <div class="stat-box"><h4>Folgas</h4><span style="color: var(--danger)">${diasFolga} dias</span></div>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    settings: {
        render() {
            const container = document.getElementById('app-content');
            container.innerHTML = `
                <div class="settings-container">
                    <h2 style="margin-bottom: 20px;">Configurações</h2>
                    
                    <div class="settings-card clickable" onclick="Modules.settings.openListJobsModal()">
                        <div class="card-title-row">
                            <span class="card-icon-main">💼</span>
                            <div class="card-info-text">
                                <h3>Meus Empregos</h3>
                                <small>Gerencie escalas, salários e cores</small>
                            </div>
                        </div>
                        <span class="card-arrow">›</span>
                    </div>

                    <div class="settings-card clickable" onclick="Modules.settings.openThemeModal()">
                        <div class="card-title-row">
                            <span class="card-icon-main">🎨</span>
                            <div class="card-info-text">
                                <h3>Aparência do App</h3>
                                <small>Modo claro, noturno ou rosa</small>
                            </div>
                        </div>
                        <span class="card-arrow">›</span>
                    </div>

                    <div class="settings-card clickable" onclick="Modules.settings.openBackupModal()">
                        <div class="card-title-row">
                            <span class="card-icon-main">💾</span>
                            <div class="card-info-text">
                                <h3>Backups Seguros</h3>
                                <small>Salvar, restaurar ou excluir dados</small>
                            </div>
                        </div>
                        <span class="card-arrow">›</span>
                    </div>
                </div>
            `;
        },

        // --- GESTOR DE BACKUPS (COM IMPORTAÇÃO E EXPORTAÇÃO DE ARQUIVOS) ---
        openBackupModal() {
            const backups = JSON.parse(localStorage.getItem('@diarias_pro_backups')) || [];
            
            let backupsHTML = '';
            if (backups.length === 0) {
                backupsHTML = `<p style="text-align:center; color: var(--text-muted); margin-top: 20px;">Nenhum backup encontrado.</p>`;
            } else {
                backups.forEach((b, index) => {
                    backupsHTML += `
                        <div class="backup-item-card" style="cursor: default;">
                            <div style="flex:1;">
                                <h3 style="margin-bottom: 3px; font-size: 1rem;">Backup ${index + 1}</h3>
                                <small style="color: var(--text-muted);">${b.date}</small>
                            </div>
                            <div style="display: flex; gap: 15px;">
                                <button onclick="Modules.settings.restoreBackup(${index})" style="background:none; border:none; font-size: 1.4rem; cursor:pointer;" title="Recarregar">🔄</button>
                                <button onclick="Modules.settings.deleteBackup(${index})" style="background:none; border:none; font-size: 1.4rem; cursor:pointer;" title="Excluir">🗑️</button>
                            </div>
                        </div>
                    `;
                });
            }

            // Adicionado a seção com botões para Arquivo Físico
            const html = `
                <button class="btn-close-modal" onclick="UI.closeModal()">✕</button>
                <div class="modal-header">
                    <h3>Gerenciador de Backups</h3>
                    <p>Mantenha seus dados seguros na memória ou no aparelho.</p>
                </div>
                
                <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <button class="btn-save" style="flex: 1; padding: 12px; font-size: 0.9rem; background: var(--text-main); color: var(--card-bg);" onclick="Modules.settings.exportBackupToFile()">📥 Baixar Arquivo</button>
                    <button class="btn-clear" style="flex: 1; margin: 0; padding: 12px; font-size: 0.9rem; border-color: var(--primary); color: var(--primary);" onclick="document.getElementById('import-file').click()">📂 Abrir Arquivo</button>
                    <input type="file" id="import-file" style="display:none;" accept=".json" onchange="Modules.settings.importBackupFromFile(event)">
                </div>

                <button class="btn-save" style="margin-bottom: 20px;" onclick="Modules.settings.createBackup()">+ Criar Backup Rápido (Memória)</button>
                
                <h4 style="margin-bottom: 10px;">Backups Salvos na Memória</h4>
                <div class="job-list">
                    ${backupsHTML}
                </div>
            `;
            UI.openModal(html);
        },

        // Função: Baixa o banco de dados como um arquivo .json para o celular
        exportBackupToFile() {
            const currentData = JSON.parse(localStorage.getItem('@diarias_pro_data')) || {};
            // Cria um arquivo (Blob) em memória contendo o texto JSON
            const blob = new Blob([JSON.stringify(currentData, null, 2)], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            
            // Força o clique no celular para iniciar o download
            const a = document.createElement('a');
            a.href = url;
            const dateStr = new Date().toISOString().split('T')[0];
            a.download = `diarias_backup_${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 0);
        },

        // Função: Lê o arquivo .json escolhido na pasta do celular e restaura o banco de dados
        importBackupFromFile(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const importedData = JSON.parse(e.target.result);
                    
                    if (importedData && typeof importedData === 'object') {
                        if (confirm("Deseja substituir seus dados atuais por este arquivo de backup que você selecionou?")) {
                            localStorage.setItem('@diarias_pro_data', JSON.stringify(importedData));
                            app.state.data = Storage.getData(); // Recarrega a memória viva
                            alert("Backup do arquivo carregado com sucesso!");
                            UI.closeModal();
                            app.navigate('calendar');
                        }
                    } else {
                        alert("Arquivo inválido. Escolha um arquivo de backup gerado pelo aplicativo.");
                    }
                } catch (error) {
                    alert("Erro ao ler o arquivo. Certifique-se de que escolheu um arquivo com final .json válido.");
                }
            };
            reader.readAsText(file); // Manda ler como texto
        },

        createBackup() {
            const backups = JSON.parse(localStorage.getItem('@diarias_pro_backups')) || [];
            const dataAtual = new Date().toLocaleString('pt-br');
            const currentData = JSON.parse(localStorage.getItem('@diarias_pro_data')) || {};
            
            backups.push({ date: dataAtual, data: currentData });
            localStorage.setItem('@diarias_pro_backups', JSON.stringify(backups));
            alert("Backup na memória criado com sucesso!");
            this.openBackupModal(); 
        },

        restoreBackup(index) {
            if(confirm("Tem certeza? Isso vai substituir seus dados atuais pelos dados deste backup da memória!")) {
                const backups = JSON.parse(localStorage.getItem('@diarias_pro_backups')) || [];
                const backupToRestore = backups[index];
                
                localStorage.setItem('@diarias_pro_data', JSON.stringify(backupToRestore.data));
                app.state.data = Storage.getData(); 
                
                alert("Dados restaurados da memória com sucesso!");
                UI.closeModal();
                app.navigate('calendar');
            }
        },

        deleteBackup(index) {
            if(confirm("Deseja mesmo excluir este backup da memória para sempre?")) {
                let backups = JSON.parse(localStorage.getItem('@diarias_pro_backups')) || [];
                backups.splice(index, 1);
                localStorage.setItem('@diarias_pro_backups', JSON.stringify(backups));
                this.openBackupModal(); 
            }
        },

        openListJobsModal() {
            if (!app.state.data.jobs) {
                const old = app.state.data.settings || {};
                app.state.data.jobs = [{ name: 'Trabalho Principal', color: '#2563eb', baseSalary: old.baseSalary || '', scaleType: old.scaleType || 'none', scaleStart: old.scaleStart || '' }];
            }
            const jobs = app.state.data.jobs;

            let jobsHTML = '';
            jobs.forEach((job, index) => {
                jobsHTML += `
                    <div class="job-item-card" style="border-left-color: ${job.color}" onclick="Modules.settings.openEditJobModal(${index})">
                        <div>
                            <h3 style="margin-bottom: 3px;">${job.name}</h3>
                            <small style="color: var(--text-muted);">${job.scaleType === 'none' ? 'Sem Escala Fixa' : 'Escala ' + job.scaleType}</small>
                        </div>
                        <span class="card-arrow">✎</span>
                    </div>
                `;
            });

            const html = `
                <button class="btn-close-modal" onclick="UI.closeModal()">✕</button>
                <div class="modal-header">
                    <h3>Meus Empregos</h3>
                    <p>Selecione um trabalho para editar ou crie um novo.</p>
                </div>
                
                <button class="btn-new-job" onclick="Modules.settings.openEditJobModal(-1)">+ Adicionar Novo Emprego</button>
                
                <div class="job-list">
                    ${jobsHTML}
                </div>
            `;
            UI.openModal(html);
        },

        openEditJobModal(jobIndex) {
            let job = { name: '', color: '#2563eb', baseSalary: '', scaleType: 'none', scaleStart: '' };
            if (jobIndex !== -1) {
                job = app.state.data.jobs[jobIndex];
            }

            const html = `
                <button class="btn-close-modal" onclick="Modules.settings.openListJobsModal()">←</button>
                <div class="modal-header">
                    <h3>${jobIndex === -1 ? 'Novo Emprego' : 'Editar Emprego'}</h3>
                </div>
                
                <div class="form-group">
                    <label>Nome do Trabalho / App</label>
                    <input type="text" id="set-job-name" value="${job.name}">
                </div>
                <div class="form-group">
                    <label>Cor de Identificação</label>
                    <input type="color" id="set-job-color" value="${job.color}" style="height: 50px; padding: 5px;">
                </div>
                <div class="form-group">
                    <label>Rotina / Escala</label>
                    <select id="set-scale-type" onchange="Modules.settings.updateProjected()">
                        <option value="none" ${job.scaleType === 'none' ? 'selected' : ''}>Sem escala fixa</option>
                        <option value="12x36" ${job.scaleType === '12x36' ? 'selected' : ''}>12x36</option>
                        <option value="24x48" ${job.scaleType === '24x48' ? 'selected' : ''}>24x48</option>
                        <option value="6x1" ${job.scaleType === '6x1' ? 'selected' : ''}>6x1</option>
                        <option value="5x2" ${job.scaleType === '5x2' ? 'selected' : ''}>5x2</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Início da Escala</label>
                    <input type="date" id="set-scale-start" value="${job.scaleStart || ''}" oninput="Modules.settings.updateProjected()">
                </div>
                <div class="form-group">
                    <label>Meta Salarial (R$)</label>
                    <input type="number" id="set-salary" value="${job.baseSalary}" oninput="Modules.settings.updateProjected()">
                </div>
                
                <div class="expense-box" id="calc-result" style="text-align: left;"></div>
                
                <button class="btn-save" onclick="Modules.settings.saveJob(${jobIndex})">Salvar Emprego</button>
            `;
            UI.openModal(html);
            this.updateProjected(); 
        },

        openThemeModal() {
            const settings = app.state.data.settings || { theme: 'light' };
            const html = `
                <button class="btn-close-modal" onclick="UI.closeModal()">✕</button>
                <div class="modal-header">
                    <h3>Escolher Tema</h3>
                    <p>O aplicativo muda de cor instantaneamente.</p>
                </div>
                <div class="theme-options">
                    <label class="theme-radio">
                        <input type="radio" name="theme-select" value="light" onchange="Modules.settings.setTheme(this.value)" ${settings.theme === 'light' ? 'checked' : ''}>
                        ☀️ Claro
                    </label>
                    <label class="theme-radio">
                        <input type="radio" name="theme-select" value="dark" onchange="Modules.settings.setTheme(this.value)" ${settings.theme === 'dark' ? 'checked' : ''}>
                        🌙 Noturno
                    </label>
                    <label class="theme-radio">
                        <input type="radio" name="theme-select" value="pink" onchange="Modules.settings.setTheme(this.value)" ${settings.theme === 'pink' ? 'checked' : ''}>
                        🌸 Rosa
                    </label>
                </div>
            `;
            UI.openModal(html);
        },

        setTheme(themeName) {
            if(!app.state.data.settings) app.state.data.settings = {};
            app.state.data.settings.theme = themeName;
            localStorage.setItem('@diarias_pro_data', JSON.stringify(app.state.data));
            app.applyTheme(themeName);
        },

        getWorkDaysStats(year, month, scaleType, scaleStart) {
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            let fullMonthCount = 0; let actualCount = 0;

            if (scaleType === 'none' || !scaleStart) {
                for (let day = 1; day <= daysInMonth; day++) {
                    const dow = new Date(year, month, day).getDay();
                    if (dow >= 1 && dow <= 5) fullMonthCount++;
                }
                return { full: fullMonthCount, actual: fullMonthCount };
            }

            const [sYear, sMonth, sDay] = scaleStart.split('-');
            const utcStart = Date.UTC(sYear, sMonth - 1, sDay);
            let cycle = 1;
            if (scaleType === '12x36') cycle = 2;
            if (scaleType === '24x48') cycle = 3;
            if (scaleType === '6x1' || scaleType === '5x2') cycle = 7;

            for (let day = 1; day <= daysInMonth; day++) {
                const utcCurrent = Date.UTC(year, month, day);
                let isWork = false;

                if (scaleType === '5x2') {
                    const dow = new Date(year, month, day).getDay();
                    isWork = (dow >= 1 && dow <= 5);
                } else {
                    let diffDays = Math.floor((utcCurrent - utcStart) / 86400000);
                    const normalizedDiff = ((diffDays % cycle) + cycle) % cycle;
                    if (scaleType === '12x36') isWork = (normalizedDiff === 0);
                    if (scaleType === '24x48') isWork = (normalizedDiff === 0);
                    if (scaleType === '6x1') isWork = (normalizedDiff !== 6);
                }
                if (isWork) fullMonthCount++;
                if (isWork && utcCurrent >= utcStart) actualCount++;
            }
            return { full: fullMonthCount, actual: actualCount };
        },

        updateProjected() {
            const elSalary = document.getElementById('set-salary');
            if(!elSalary) return; 

            const salary = parseFloat(elSalary.value) || 0;
            const scaleType = document.getElementById('set-scale-type').value;
            const scaleStart = document.getElementById('set-scale-start').value;
            
            const now = new Date();
            const stats = this.getWorkDaysStats(now.getFullYear(), now.getMonth(), scaleType, scaleStart);
            const dailyRate = salary / (stats.full || 1);
            const fMoeda = (val) => val.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

            document.getElementById('calc-result').innerHTML = `
                <p style="margin-bottom: 8px;">✔️ Diárias previstas: <strong>${stats.full} dias</strong></p>
                <p style="margin-bottom: 8px;">🎯 Diária Exata: <strong style="color: var(--primary);">${fMoeda(dailyRate)}</strong></p>
            `;
        },

        saveJob(jobIndex) {
            const name = document.getElementById('set-job-name').value;
            const color = document.getElementById('set-job-color').value;
            const salary = parseFloat(document.getElementById('set-salary').value) || 0;
            const scaleType = document.getElementById('set-scale-type').value;
            const scaleStart = document.getElementById('set-scale-start').value;
            
            if (scaleType !== 'none' && !scaleStart) return alert("Selecione a Data de Início!");
            
            const newJob = { name, color, baseSalary: salary, scaleType, scaleStart };
            
            if (jobIndex === -1) {
                app.state.data.jobs.push(newJob); 
            } else {
                app.state.data.jobs[jobIndex] = newJob; 
            }

            localStorage.setItem('@diarias_pro_data', JSON.stringify(app.state.data));
            app.state.data = Storage.getData();
            
            this.openListJobsModal();
        }
    }
};
