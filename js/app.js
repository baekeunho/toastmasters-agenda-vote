(function () {
  var GUARD_KEY = 'tm_vote_guard_v1';

  var CATEGORY_LABELS = {
    BestSpeaker: 'Best Speaker',
    BestTableTopics: 'Best Table Topics Speaker',
    BestEvaluator: 'Best Evaluator'
  };

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function loadGuard() {
    try {
      return JSON.parse(localStorage.getItem(GUARD_KEY)) || null;
    } catch (err) {
      return null;
    }
  }

  function saveGuard(guard) {
    localStorage.setItem(GUARD_KEY, JSON.stringify(guard));
  }

  function freshGuard(meetingId) {
    return { meetingId: meetingId, votedCategories: [], feedbackGiven: [] };
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('club-name').textContent =
      (window.TM_CONFIG && window.TM_CONFIG.CLUB_NAME) || 'Toastmasters Club';
    document.getElementById('refresh-btn').addEventListener('click', load);
    load();
  });

  async function load() {
    var content = document.getElementById('content');
    content.innerHTML = '<p class="muted">Loading agenda…</p>';
    try {
      var data = await TM_API.getAgenda();
      if (!data.ok) {
        content.innerHTML = '<p class="status-line error">Could not load the agenda.</p>';
        return;
      }
      if (!data.meetingId) {
        content.innerHTML = '<p class="muted">No agenda has been published yet. Check back soon.</p>';
        return;
      }

      var guard = loadGuard();
      if (!guard || guard.meetingId !== data.meetingId) {
        guard = freshGuard(data.meetingId);
        saveGuard(guard);
      }

      render(data, guard);
    } catch (err) {
      content.innerHTML = '<p class="status-line error">Could not reach the server. Check your connection and try again.</p>';
    }
  }

  function render(data, guard) {
    document.getElementById('meeting-title').textContent = data.meetingTitle || 'Meeting Agenda';
    document.getElementById('meeting-meta').textContent = data.meetingDate || '';

    var content = document.getElementById('content');
    content.innerHTML = '';
    content.appendChild(renderAgendaCard(data.agenda));

    VoteCategoryOrder().forEach(function (category) {
      var panel = renderVotePanel(category, data, guard);
      if (panel) content.appendChild(panel);
    });

    data.agenda
      .filter(function (row) { return row.collectFeedback === 'yes' && row.name; })
      .forEach(function (row) {
        content.appendChild(renderFeedbackCard(row, data, guard));
      });
  }

  function VoteCategoryOrder() {
    return ['BestSpeaker', 'BestTableTopics', 'BestEvaluator'];
  }

  function renderAgendaCard(agenda) {
    var card = document.createElement('div');
    card.className = 'card';
    var html = '<h2>Agenda</h2>';
    if (!agenda.length) {
      html += '<p class="muted">No agenda items yet.</p>';
    } else {
      agenda.forEach(function (row) {
        html += '<div class="agenda-row">' +
          '<div><div class="role">' + escapeHtml(row.role) + '</div>' +
          '<div class="name">' + escapeHtml(row.name || 'TBD') + '</div>' +
          (row.title ? '<div class="title">' + escapeHtml(row.title) + '</div>' : '') +
          '</div>' +
          (row.time ? '<div class="time">' + escapeHtml(row.time) + '</div>' : '') +
          '</div>';
      });
    }
    card.innerHTML = html;
    return card;
  }

  function renderVotePanel(category, data, guard) {
    var eligible = data.agenda.filter(function (row) {
      return row.awardCategory === category && row.name;
    });
    var isWriteIn = category === 'BestTableTopics' && eligible.length === 0;

    if (!isWriteIn && eligible.length === 0) return null;

    var alreadyVoted = guard.votedCategories.indexOf(category) !== -1;

    var card = document.createElement('div');
    card.className = 'card';
    var html = '<h2>' + escapeHtml(CATEGORY_LABELS[category]) + '</h2>';

    if (alreadyVoted) {
      html += '<p class="status-line success">Thanks, your vote is in.</p>';
      card.innerHTML = html;
      return card;
    }

    var inputName = 'vote-' + category;
    if (isWriteIn) {
      var listId = 'names-' + category;
      html += '<input type="text" list="' + listId + '" id="' + inputName + '" placeholder="Type the speaker\'s name">';
      html += '<datalist id="' + listId + '">';
      data.agenda.forEach(function (row) {
        if (row.name) html += '<option value="' + escapeHtml(row.name) + '">';
      });
      html += '</datalist>';
    } else {
      eligible.forEach(function (row, i) {
        var optId = inputName + '-' + i;
        html += '<label class="option" for="' + optId + '">' +
          '<input type="radio" name="' + inputName + '" id="' + optId + '" value="' + escapeHtml(row.name) + '">' +
          '<span>' + escapeHtml(row.name) + (row.title ? ' — ' + escapeHtml(row.title) : '') + '</span>' +
          '</label>';
      });
    }

    html += '<button class="primary" type="button" data-category="' + category + '">Submit vote</button>';
    html += '<div class="status-line" data-status></div>';
    card.innerHTML = html;

    var button = card.querySelector('button[data-category]');
    button.addEventListener('click', function () {
      submitVote(category, card, guard, isWriteIn, inputName);
    });

    return card;
  }

  async function submitVote(category, card, guard, isWriteIn, inputName) {
    var status = card.querySelector('[data-status]');
    var nominee;
    if (isWriteIn) {
      nominee = card.querySelector('#' + inputName).value.trim();
    } else {
      var checked = card.querySelector('input[name="' + inputName + '"]:checked');
      nominee = checked ? checked.value : '';
    }

    if (!nominee) {
      status.textContent = 'Pick or enter a name first.';
      status.className = 'status-line error';
      return;
    }

    var button = card.querySelector('button[data-category]');
    button.disabled = true;
    status.textContent = 'Submitting…';
    status.className = 'status-line';

    try {
      var res = await TM_API.vote({ meetingId: guard.meetingId, category: category, nominee: nominee });
      if (res.ok) {
        guard.votedCategories.push(category);
        saveGuard(guard);
        status.textContent = 'Thanks, your vote is in.';
        status.className = 'status-line success';
        card.querySelectorAll('input, button').forEach(function (el) { el.disabled = true; });
      } else if (res.error === 'stale_meeting') {
        status.textContent = 'The agenda changed — refreshing…';
        status.className = 'status-line error';
        load();
      } else {
        status.textContent = 'Could not submit your vote. Try again.';
        status.className = 'status-line error';
        button.disabled = false;
      }
    } catch (err) {
      status.textContent = 'Could not reach the server. Try again.';
      status.className = 'status-line error';
      button.disabled = false;
    }
  }

  function renderFeedbackCard(row, data, guard) {
    var alreadyGiven = guard.feedbackGiven.indexOf(row.name) !== -1;
    var card = document.createElement('div');
    card.className = 'card';
    var html = '<h2>Feedback for ' + escapeHtml(row.name) + '</h2>';
    if (row.title) html += '<p class="muted">' + escapeHtml(row.title) + '</p>';
    if (alreadyGiven) html += '<span class="badge">Feedback submitted — you can add more</span>';
    html += '<textarea placeholder="What went well? What could improve?"></textarea>';
    html += '<button class="primary" type="button">Submit feedback</button>';
    html += '<div class="status-line" data-status></div>';
    card.innerHTML = html;

    var textarea = card.querySelector('textarea');
    var button = card.querySelector('button');
    var status = card.querySelector('[data-status]');

    button.addEventListener('click', async function () {
      var text = textarea.value.trim();
      if (!text) {
        status.textContent = 'Write a comment first.';
        status.className = 'status-line error';
        return;
      }
      button.disabled = true;
      status.textContent = 'Submitting…';
      status.className = 'status-line';
      try {
        var res = await TM_API.submitFeedback({
          meetingId: guard.meetingId,
          speaker: row.name,
          speechTitle: row.title || '',
          feedback: text
        });
        if (res.ok) {
          if (guard.feedbackGiven.indexOf(row.name) === -1) {
            guard.feedbackGiven.push(row.name);
            saveGuard(guard);
          }
          textarea.value = '';
          status.textContent = 'Thanks, feedback sent.';
          status.className = 'status-line success';
        } else if (res.error === 'stale_meeting') {
          status.textContent = 'The agenda changed — refreshing…';
          status.className = 'status-line error';
          load();
        } else {
          status.textContent = 'Could not submit feedback. Try again.';
          status.className = 'status-line error';
        }
      } catch (err) {
        status.textContent = 'Could not reach the server. Try again.';
        status.className = 'status-line error';
      } finally {
        button.disabled = false;
      }
    });

    return card;
  }
})();
