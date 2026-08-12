(function () {
  var PIN_SESSION_KEY = 'tm_edit_pin';

  var AWARD_OPTIONS = [
    { value: '', label: 'None' },
    { value: 'BestSpeaker', label: 'Best Speaker' },
    { value: 'BestTableTopics', label: 'Best Table Topics Speaker' },
    { value: 'BestEvaluator', label: 'Best Evaluator' }
  ];

  var rows = [];

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function blankRow() {
    return { role: '', name: '', title: '', time: '', awardCategory: '', collectFeedback: '' };
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('club-name').textContent =
      (window.TM_CONFIG && window.TM_CONFIG.CLUB_NAME) || 'Toastmasters Club';

    var pin = (window.TM_CONFIG && window.TM_CONFIG.EDIT_PIN) || '';
    if (pin) {
      var stored = sessionStorage.getItem(PIN_SESSION_KEY);
      if (stored === pin) {
        showEditor();
      } else {
        showPinGate(pin);
      }
    } else {
      showEditor();
    }

    document.getElementById('add-row-btn').addEventListener('click', function () {
      rows.push(blankRow());
      renderRows();
    });
    document.getElementById('publish-btn').addEventListener('click', publish);
  });

  function showPinGate(pin) {
    var gate = document.getElementById('pin-gate');
    gate.hidden = false;
    document.getElementById('pin-submit').addEventListener('click', function () {
      var entered = document.getElementById('pin-input').value;
      if (entered === pin) {
        sessionStorage.setItem(PIN_SESSION_KEY, entered);
        gate.hidden = true;
        showEditor();
      } else {
        document.getElementById('pin-error').textContent = 'Incorrect PIN.';
      }
    });
  }

  async function showEditor() {
    document.getElementById('editor').hidden = false;
    try {
      var data = await TM_API.getAgenda();
      if (data.ok && data.meetingId) {
        document.getElementById('meeting-title-input').value = data.meetingTitle || '';
        document.getElementById('meeting-date-input').value = data.meetingDate || '';
        rows = data.agenda.map(function (r) {
          return {
            role: r.role || '',
            name: r.name || '',
            title: r.title || '',
            time: r.time || '',
            awardCategory: r.awardCategory || '',
            collectFeedback: r.collectFeedback || ''
          };
        });
      }
    } catch (err) {
      // Fall through with an empty/blank editor if the fetch fails.
    }
    if (rows.length === 0) rows.push(blankRow());
    renderRows();
  }

  function renderRows() {
    var container = document.getElementById('rows');
    container.innerHTML = '';
    rows.forEach(function (row, index) {
      container.appendChild(renderRow(row, index));
    });
  }

  function renderRow(row, index) {
    var el = document.createElement('div');
    el.className = 'editor-row';

    var awardOptionsHtml = AWARD_OPTIONS.map(function (opt) {
      var selected = opt.value === row.awardCategory ? ' selected' : '';
      return '<option value="' + opt.value + '"' + selected + '>' + opt.label + '</option>';
    }).join('');

    el.innerHTML =
      '<div><label>Role</label><input type="text" data-field="role" value="' + escapeHtml(row.role) + '" placeholder="Speaker 1"></div>' +
      '<div><label>Name</label><input type="text" data-field="name" value="' + escapeHtml(row.name) + '" placeholder="Member name"></div>' +
      '<div><label>Speech / topic title</label><input type="text" data-field="title" value="' + escapeHtml(row.title) + '"></div>' +
      '<div><label>Time</label><input type="text" data-field="time" value="' + escapeHtml(row.time) + '" placeholder="5-7 min"></div>' +
      '<div><label>Award category</label><select data-field="awardCategory">' + awardOptionsHtml + '</select></div>' +
      '<div class="checkbox-field"><input type="checkbox" data-field="collectFeedback" id="cf-' + index + '"' + (row.collectFeedback === 'yes' ? ' checked' : '') + '><label for="cf-' + index + '">Collect written feedback</label></div>' +
      '<div class="row-actions">' +
        '<button class="icon-btn" type="button" data-action="up">↑</button>' +
        '<button class="icon-btn" type="button" data-action="down">↓</button>' +
        '<button class="icon-btn" type="button" data-action="delete">✕</button>' +
      '</div>';

    el.querySelectorAll('[data-field]').forEach(function (input) {
      input.addEventListener('input', function () {
        var field = input.getAttribute('data-field');
        row[field] = field === 'collectFeedback'
          ? (input.checked ? 'yes' : '')
          : input.value;
      });
    });

    el.querySelector('[data-action="up"]').addEventListener('click', function () {
      if (index === 0) return;
      rows.splice(index - 1, 0, rows.splice(index, 1)[0]);
      renderRows();
    });
    el.querySelector('[data-action="down"]').addEventListener('click', function () {
      if (index === rows.length - 1) return;
      rows.splice(index + 1, 0, rows.splice(index, 1)[0]);
      renderRows();
    });
    el.querySelector('[data-action="delete"]').addEventListener('click', function () {
      rows.splice(index, 1);
      renderRows();
    });

    return el;
  }

  async function publish() {
    var status = document.getElementById('publish-status');
    var button = document.getElementById('publish-btn');
    button.disabled = true;
    status.textContent = 'Publishing…';
    status.className = 'status-line';

    var agenda = rows
      .filter(function (r) { return r.role || r.name; })
      .map(function (r, i) {
        return {
          order: i + 1,
          role: r.role,
          name: r.name,
          title: r.title,
          time: r.time,
          awardCategory: r.awardCategory,
          collectFeedback: r.collectFeedback
        };
      });

    var payload = {
      meetingTitle: document.getElementById('meeting-title-input').value.trim(),
      meetingDate: document.getElementById('meeting-date-input').value,
      agenda: agenda,
      pin: sessionStorage.getItem(PIN_SESSION_KEY) || ''
    };

    try {
      var res = await TM_API.publishAgenda(payload);
      if (res.ok) {
        status.textContent = 'Published. Attendees will see the new agenda next time they load or refresh the page.';
        status.className = 'status-line success';
      } else if (res.error === 'invalid_pin') {
        status.textContent = 'Incorrect PIN. Reload this page and try again.';
        status.className = 'status-line error';
        sessionStorage.removeItem(PIN_SESSION_KEY);
      } else {
        status.textContent = 'Could not publish. Try again.';
        status.className = 'status-line error';
      }
    } catch (err) {
      status.textContent = 'Could not reach the server. Try again.';
      status.className = 'status-line error';
    } finally {
      button.disabled = false;
    }
  }
})();
