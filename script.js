class CalendarApp {
    constructor() {
        this.currentDate = new Date();
        this.selectedDate = null;

        // Data Store (In-memory for now)
        this.tasks = {}; // { "YYYY-MM-DD": [{id, text, completed}] }
        this.schedules = {}; // { "YYYY-MM-DD": [{id, title, start, end}] } // start/end in "HH:MM"

        this.selectedItem = null; // { type: 'task'|'schedule', id: number }

        // DOM Elements
        this.grid = document.getElementById('calendarGrid');
        this.monthLabel = document.getElementById('currentMonthYear');
        this.appContainer = document.querySelector('.app-container');
        this.detailPanel = document.getElementById('detailPanel');
        this.selectedDateDisplay = document.getElementById('selectedDateDisplay');
        this.taskList = document.getElementById('taskList');
        this.timelineContainer = document.getElementById('timelineContainer');
        this.timeSlots = document.querySelector('.time-slots');
        this.eventsLayer = document.getElementById('eventsLayer');

        // Modals
        this.taskModal = document.getElementById('taskModal');
        this.scheduleModal = document.getElementById('scheduleModal');

        this.initEventListeners();
        this.loadData();
        this.render();
    }

    initEventListeners() {
        // Navigation
        document.getElementById('prevMonth').addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.render();
        });

        document.getElementById('nextMonth').addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.render();
        });

        // Detail Panel
        document.getElementById('closeDetail').addEventListener('click', () => {
            this.selectDate(this.selectedDate, null); // Deselect
        });

        // Global Click to close context menu
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) {
                this.hideContextMenu();
            }
        });

        // Add Buttons
        document.getElementById('addTaskBtn').addEventListener('click', () => this.openTaskModal());
        document.getElementById('addScheduleBtn').addEventListener('click', () => this.openScheduleModal());

        // Modals - Task
        document.getElementById('cancelTaskBtn').addEventListener('click', () => this.closeModals());
        document.getElementById('saveTaskBtn').addEventListener('click', () => this.saveTask());

        // Modals - Schedule
        document.getElementById('cancelScheduleBtn').addEventListener('click', () => this.closeModals());
        document.getElementById('saveScheduleBtn').addEventListener('click', () => this.saveSchedule());

        // Context Menu Actions
        document.getElementById('ctxEditBtn').addEventListener('click', () => {
            const currentItem = this.selectedItem;
            this.hideContextMenu(); // Still hide UI immediately

            if (currentItem && currentItem.type === 'task') {
                const task = this.tasks[this.selectedDate].find(t => t.id === currentItem.id);
                this.openTaskModal(task);
            } else if (currentItem && currentItem.type === 'schedule') {
                const sch = this.schedules[this.selectedDate].find(s => s.id === currentItem.id);
                this.openScheduleModal(sch);
            }
        });

        document.getElementById('ctxDeleteBtn').addEventListener('click', () => {
            const currentItem = this.selectedItem;
            this.hideContextMenu();

            if (currentItem && currentItem.type === 'task') {
                this.deleteTask(this.selectedDate, currentItem.id);
            } else if (currentItem && currentItem.type === 'schedule') {
                this.deleteSchedule(this.selectedDate, currentItem.id);
            }
        });

        // Modal Input Shortcuts (Enter to Save/Next)
        document.getElementById('taskInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveTask();
            }
        });

        const scheduleInputs = ['scheduleTitleInput', 'startTimeInput', 'endTimeInput'];
        scheduleInputs.forEach((id, index) => {
            document.getElementById(id).addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (index < scheduleInputs.length - 1) {
                        // Next input
                        document.getElementById(scheduleInputs[index + 1]).focus();
                    } else {
                        // Save
                        this.saveSchedule();
                    }
                }
            });
        });

        // Shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.selectedDate) return;

            if (e.altKey && e.key === 't') {
                e.preventDefault();
                this.openTaskModal();
            }
            if (e.altKey && e.key === 'p') {
                e.preventDefault();
                this.openScheduleModal();
            }
            if (e.key === 'Escape') {
                this.hideContextMenu();
                if (this.taskModal.classList.contains('active') || this.scheduleModal.classList.contains('active')) {
                    this.closeModals();
                } else if (this.selectedDate) {
                    this.selectDate(this.selectedDate, null);
                }
            }
        });
    }

    // --- Persistence ---

    loadData() {
        try {
            const savedTasks = localStorage.getItem('calendar_tasks');
            const savedSchedules = localStorage.getItem('calendar_schedules');

            if (savedTasks) this.tasks = JSON.parse(savedTasks);
            if (savedSchedules) this.schedules = JSON.parse(savedSchedules);
        } catch (e) {
            console.error('Failed to load data', e);
        }
    }

    saveData() {
        try {
            localStorage.setItem('calendar_tasks', JSON.stringify(this.tasks));
            localStorage.setItem('calendar_schedules', JSON.stringify(this.schedules));
        } catch (e) {
            console.error('Failed to save data', e);
        }
    }

    showContextMenu(x, y, type, id) {
        this.selectedItem = { type, id };
        const menu = document.getElementById('contextMenu');

        // Adjust position to stay in viewport (basic)
        const appRect = this.appContainer.getBoundingClientRect();
        let left = x;
        let top = y;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.classList.add('active');
    }

    hideContextMenu() {
        document.getElementById('contextMenu').classList.remove('active');
        this.selectedItem = null;
    }

    deleteTask(dateStr, taskId) {
        if (!confirm('このタスクを削除しますか？')) return;
        this.tasks[dateStr] = this.tasks[dateStr].filter(t => t.id !== taskId);

        // Cleanup if empty
        if (this.tasks[dateStr].length === 0) {
            delete this.tasks[dateStr];
        }

        this.saveData();
        this.renderDetails(dateStr);
        this.render();
    }

    deleteSchedule(dateStr, schId) {
        if (!confirm('この予定を削除しますか？')) return;
        this.schedules[dateStr] = this.schedules[dateStr].filter(s => s.id !== schId);

        // Cleanup if empty
        if (this.schedules[dateStr].length === 0) {
            delete this.schedules[dateStr];
        }

        this.saveData();
        this.renderDetails(dateStr);
        this.render();
    }

    render() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        // Update Header (Japanese)
        // month is 0-indexed
        this.monthLabel.textContent = `${year}年 ${month + 1}月`;

        // Clear Grid
        this.grid.innerHTML = '';

        // Calculate days
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Empty cells
        for (let i = 0; i < firstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('day-cell', 'empty');
            this.grid.appendChild(emptyCell);
        }

        // Day cells
        const today = new Date();
        for (let i = 1; i <= daysInMonth; i++) {
            const cell = document.createElement('div');
            cell.classList.add('day-cell');

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            cell.dataset.date = dateStr;

            const dayNum = document.createElement('span');
            dayNum.classList.add('day-number');
            dayNum.textContent = i;
            cell.appendChild(dayNum);

            // Highlight today
            if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayNum.classList.add('today');
            }

            // Highlight selected
            if (this.selectedDate === dateStr) {
                cell.classList.add('selected');
            }

            // Indicators for data
            this.renderDayContent(cell, dateStr);

            cell.addEventListener('click', () => this.selectDate(dateStr, cell));

            this.grid.appendChild(cell);
        }
    }

    renderDayContent(cell, dateStr) {
        const dayTasks = this.tasks[dateStr] || [];
        const daySchedules = this.schedules[dateStr] || [];

        if (dayTasks.length === 0 && daySchedules.length === 0) return;

        const container = document.createElement('div');
        container.classList.add('day-content');

        // Combined list for display
        // Show max 3 items
        const maxItems = 3;
        let count = 0;

        // Schedules first
        daySchedules.forEach(sch => {
            if (count >= maxItems) return;
            const el = document.createElement('div');
            el.classList.add('mini-item', 'mini-schedule');
            el.textContent = `${sch.start} ${sch.title}`;
            container.appendChild(el);
            count++;
        });

        // Tasks next
        dayTasks.forEach(task => {
            if (count >= maxItems) return;
            const el = document.createElement('div');
            el.classList.add('mini-item', 'mini-task');
            if (task.completed) el.classList.add('is-completed');
            el.textContent = task.text;
            container.appendChild(el);
            count++;
        });

        // More indicator
        const total = daySchedules.length + dayTasks.length;
        if (total > maxItems) {
            const more = document.createElement('div');
            more.classList.add('more-indicator');
            more.textContent = `+他 ${total - maxItems} 件`;
            container.appendChild(more);
        }

        cell.appendChild(container);
    }

    selectDate(dateStr, cellElement) {
        if (this.selectedDate === dateStr) {
            // Deselect
            this.selectedDate = null;
            this.appContainer.classList.remove('has-selection');
        } else {
            // Select new
            this.selectedDate = dateStr;
            this.appContainer.classList.add('has-selection');
            this.renderDetails(dateStr);
        }
        this.render(); // Re-render grid to update selection styles
    }

    renderDetails(dateStr) {
        if (!dateStr) return;

        // Header: YYYY年MM月DD日
        const [y, m, d] = dateStr.split('-');
        this.selectedDateDisplay.textContent = `${y}年${Number(m)}月${Number(d)}日`;

        this.renderTaskList(dateStr);
        this.renderTimeline(dateStr);
    }

    // --- Task Logic ---

    renderTaskList(dateStr) {
        this.taskList.innerHTML = '';
        const dayTasks = this.tasks[dateStr] || [];

        if (dayTasks.length === 0) {
            this.taskList.innerHTML = '<div class="empty-state">タスクはありません</div>';
            return;
        }

        dayTasks.forEach(task => {
            const item = document.createElement('div');
            item.className = `task-item ${task.completed ? 'completed' : ''}`;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'task-checkbox';
            checkbox.checked = task.completed;
            checkbox.addEventListener('change', () => this.toggleTask(dateStr, task.id));

            const text = document.createElement('span');
            text.textContent = task.text;

            item.appendChild(checkbox);
            item.appendChild(text);

            // Interaction: Context Menu (Double Click)
            item.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showContextMenu(e.pageX, e.pageY, 'task', task.id);
            });

            this.taskList.appendChild(item);
        });
    }

    openTaskModal(task = null) {
        if (!this.selectedDate) return;

        this.editingTaskId = task ? task.id : null;
        document.getElementById('taskInput').value = task ? task.text : '';

        this.taskModal.classList.add('active');
        document.getElementById('taskInput').focus();
    }

    saveTask() {
        const input = document.getElementById('taskInput');
        const text = input.value.trim();
        if (!text) return;

        if (!this.tasks[this.selectedDate]) {
            this.tasks[this.selectedDate] = [];
        }

        if (this.editingTaskId) {
            // Update
            const task = this.tasks[this.selectedDate].find(t => t.id === this.editingTaskId);
            if (task) {
                task.text = text;
            }
        } else {
            // New
            this.tasks[this.selectedDate].push({
                id: Date.now(),
                text: text,
                completed: false
            });
        }

        this.saveData(); // Persist
        this.closeModals();
        this.renderDetails(this.selectedDate);
        this.render(); // Update grid indicators
    }

    toggleTask(dateStr, taskId) {
        const task = this.tasks[dateStr].find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            this.saveData(); // Persist
            this.renderTaskList(dateStr);
        }
    }

    // --- Schedule Logic ---

    renderTimeline(dateStr) {
        // Setup slots 00:00 - 23:00
        this.timeSlots.innerHTML = '';
        for (let i = 0; i < 24; i++) {
            const slot = document.createElement('div');
            slot.className = 'time-slot';

            const label = document.createElement('div');
            label.className = 'time-label';
            label.textContent = `${String(i).padStart(2, '0')}:00`;

            slot.appendChild(label);
            this.timeSlots.appendChild(slot);
        }

        // Render Events
        this.eventsLayer.innerHTML = '';
        const daySchedules = this.schedules[dateStr] || [];

        daySchedules.forEach(sch => {
            const el = document.createElement('div');
            el.className = 'timeline-event';

            // Calculate Position
            // Each hour is 50px
            const [startH, startM] = sch.start.split(':').map(Number);
            const [endH, endM] = sch.end.split(':').map(Number);

            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;
            const durationMinutes = endMinutes - startMinutes;

            const top = (startMinutes / 60) * 50;
            const height = (durationMinutes / 60) * 50;

            el.style.top = `${top}px`;
            el.style.height = `${Math.max(20, height)}px`; // Min height for visibility

            el.innerHTML = `<span class="event-time">${sch.start}</span> ${sch.title}`;

            // Interaction: Context Menu (Double Click)
            el.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showContextMenu(e.pageX, e.pageY, 'schedule', sch.id);
            });

            this.eventsLayer.appendChild(el);
        });
    }

    openScheduleModal(sch = null) {
        if (!this.selectedDate) return;

        this.editingScheduleId = sch ? sch.id : null;
        document.getElementById('scheduleTitleInput').value = sch ? sch.title : '';
        document.getElementById('startTimeInput').value = sch ? sch.start : '09:00';
        document.getElementById('endTimeInput').value = sch ? sch.end : '10:00';

        this.scheduleModal.classList.add('active');
        document.getElementById('scheduleTitleInput').focus();
    }

    saveSchedule() {
        const title = document.getElementById('scheduleTitleInput').value.trim();
        const start = document.getElementById('startTimeInput').value;
        const end = document.getElementById('endTimeInput').value;

        if (!title || !start || !end) return;

        if (!this.schedules[this.selectedDate]) {
            this.schedules[this.selectedDate] = [];
        }

        if (this.editingScheduleId) {
            // Update
            const sch = this.schedules[this.selectedDate].find(s => s.id === this.editingScheduleId);
            if (sch) {
                sch.title = title;
                sch.start = start;
                sch.end = end;
            }
        } else {
            // New
            this.schedules[this.selectedDate].push({
                id: Date.now(),
                title,
                start,
                end
            });
        }

        this.saveData(); // Persist
        this.closeModals();
        this.renderDetails(this.selectedDate);
        this.render(); // update indicators
    }

    // --- Common ---

    closeModals() {
        this.taskModal.classList.remove('active');
        this.scheduleModal.classList.remove('active');
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    new CalendarApp();
});
