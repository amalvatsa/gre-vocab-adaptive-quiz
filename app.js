const STORAGE_KEY = "gre_vocab_learning_stats_v1";

const el = {
  quizType: document.getElementById("quizType"),
  listPreset: document.getElementById("listPreset"),
  listStart: document.getElementById("listStart"),
  listEnd: document.getElementById("listEnd"),
  listPreview: document.getElementById("listPreview"),
  questionCount: document.getElementById("questionCount"),
  stuckOnly: document.getElementById("stuckOnly"),
  startBtn: document.getElementById("startBtn"),
  resetStatsBtn: document.getElementById("resetStatsBtn"),
  quizPanel: document.getElementById("quizPanel"),
  summaryPanel: document.getElementById("summaryPanel"),
  qInfo: document.getElementById("qInfo"),
  scoreInfo: document.getElementById("scoreInfo"),
  accuracyInfo: document.getElementById("accuracyInfo"),
  progressBar: document.getElementById("progressBar"),
  prompt: document.getElementById("prompt"),
  choices: document.getElementById("choices"),
  feedback: document.getElementById("feedback"),
  familyHint: document.getElementById("familyHint"),
  nextBtn: document.getElementById("nextBtn"),
  endBtn: document.getElementById("endBtn"),
  summaryText: document.getElementById("summaryText"),
  stuckWords: document.getElementById("stuckWords"),
};

let stats = loadStats();
let session = null;
let availableLists = [];

init();

el.startBtn.addEventListener("click", startQuiz);
el.nextBtn.addEventListener("click", nextQuestion);
el.endBtn.addEventListener("click", endQuiz);
el.resetStatsBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  stats = {};
  alert("Learning stats reset.");
});
el.listPreset.addEventListener("change", onPresetChange);
el.listStart.addEventListener("change", syncRange);
el.listEnd.addEventListener("change", syncRange);

function init() {
  setupListDropdowns();
  updateListPreview();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function setupListDropdowns() {
  availableLists = [...new Set(WORDS.map((w) => w.list))].sort((a, b) => a - b);
  el.listStart.innerHTML = "";
  el.listEnd.innerHTML = "";

  availableLists.forEach((n) => {
    const a = document.createElement("option");
    a.value = String(n);
    a.textContent = `List ${n}`;
    el.listStart.appendChild(a);

    const b = document.createElement("option");
    b.value = String(n);
    b.textContent = `List ${n}`;
    el.listEnd.appendChild(b);
  });

  el.listStart.value = String(availableLists[0]);
  el.listEnd.value = String(availableLists[availableLists.length - 1]);
}

function onPresetChange() {
  const preset = el.listPreset.value;
  const min = availableLists[0];
  const max = availableLists[availableLists.length - 1];

  if (preset === "all") {
    el.listStart.value = String(min);
    el.listEnd.value = String(max);
  } else if (preset === "first4") {
    el.listStart.value = String(min);
    el.listEnd.value = String(Math.min(min + 3, max));
  } else if (preset === "first8") {
    el.listStart.value = String(min);
    el.listEnd.value = String(Math.min(min + 7, max));
  } else if (preset === "last6") {
    el.listStart.value = String(Math.max(max - 5, min));
    el.listEnd.value = String(max);
  }

  syncRange();
}

function syncRange() {
  let start = Number(el.listStart.value);
  let end = Number(el.listEnd.value);
  if (start > end) {
    [start, end] = [end, start];
    el.listStart.value = String(start);
    el.listEnd.value = String(end);
  }
  updateListPreview();
}

function updateListPreview() {
  const lists = selectedLists();
  const count = WORDS.filter((w) => lists.includes(w.list)).length;
  el.listPreview.textContent = `Using lists ${lists[0]}-${lists[lists.length - 1]} (${count} words)`;
}

function selectedLists() {
  const start = Number(el.listStart.value);
  const end = Number(el.listEnd.value);
  return availableLists.filter((n) => n >= start && n <= end);
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function startQuiz() {
  const lists = selectedLists();
  let pool = WORDS.filter((w) => lists.includes(w.list));

  if (el.stuckOnly.checked) {
    pool = pool.filter((w) => getWordStats(w.word).wrong >= 2 || getWordStats(w.word).mastery < 0.55);
  }

  if (pool.length < 4) {
    alert("Not enough words in this selection. Try a wider range.");
    return;
  }

  session = {
    pool,
    families: buildFamilies(pool),
    maxQ: Math.max(5, Math.min(200, Number(el.questionCount.value) || 30)),
    qNo: 0,
    correct: 0,
    askedWords: [],
    retryQueue: [],
    wrongThisSession: {},
    wordAskCount: {},
    active: null,
  };

  el.summaryPanel.classList.add("hidden");
  el.quizPanel.classList.remove("hidden");
  el.progressBar.style.width = "0%";
  nextQuestion();
}

function getWordStats(word) {
  if (!stats[word]) {
    stats[word] = { seen: 0, correct: 0, wrong: 0, streak: 0, mastery: 0, lastWrongAt: -1000, lastSeenAt: -1000 };
  }
  return stats[word];
}

function updateMastery(s) {
  s.mastery = (s.correct + 1) / (s.seen + 2);
}

function weightedPick(words) {
  const now = session.qNo;
  const recent = new Set(session.askedWords.slice(-4));
  const items = words.filter((w) => words.length <= 6 || !recent.has(w.word));
  const minAsked = Math.min(...items.map((w) => session.wordAskCount[w.word] || 0));
  const freshItems = items.filter((w) => (session.wordAskCount[w.word] || 0) === minAsked);
  const candidatePool = freshItems.length ? freshItems : items;

  let total = 0;
  const arr = candidatePool.map((w) => {
    const s = getWordStats(w.word);
    const wrongBias = 1 + s.wrong * 2.2;
    const lowMasteryBias = 1 + (1 - s.mastery) * 3;
    const stuckBoost = now - s.lastWrongAt <= 12 ? 6 : 0;
    const freshnessPenalty = now - s.lastSeenAt <= 2 ? 0.35 : 1;
    const retryBoost = session.retryQueue.includes(w.word) ? 8 : 0;
    const weight = (wrongBias + lowMasteryBias + stuckBoost + retryBoost) * freshnessPenalty + Math.random();
    total += weight;
    return { w, weight };
  });

  let r = Math.random() * total;
  for (const it of arr) {
    r -= it.weight;
    if (r <= 0) return it.w;
  }
  return arr[arr.length - 1].w;
}

function pickQuestionWord() {
  if (session.retryQueue.length && Math.random() < 0.65) {
    const retryWord = session.retryQueue.shift();
    const tooRecent = session.askedWords.slice(-3).includes(retryWord);
    const found = tooRecent ? null : session.pool.find((w) => w.word === retryWord);
    if (found) return found;
  }
  return weightedPick(session.pool);
}

function buildQuestion(target) {
  const quizType = el.quizType.value === "mixed"
    ? (Math.random() < 0.7 ? (Math.random() < 0.5 ? "family_match" : "family_odd") : (Math.random() < 0.5 ? "word_to_group" : "group_to_word"))
    : el.quizType.value;

  const family = session.families.byWord[target.word] || [];
  if (quizType === "family_match" && family.length) {
    const correct = shuffle(family)[0];
    const distractors = shuffle(
      session.pool
        .map((w) => w.word)
        .filter((w) => w !== target.word && !family.includes(w))
    ).slice(0, 3);
    const options = shuffle([
      { label: correct, correct: true },
      ...distractors.map((w) => ({ label: w, correct: false })),
    ]);
    return { prompt: `Main word: ${target.word}. Pick a word from the same family.`, options, answer: correct };
  }

  if (quizType === "family_odd" && family.length >= 3) {
    const familyWords = shuffle(family).slice(0, 3);
    const outsider = shuffle(
      session.pool
        .map((w) => w.word)
        .filter((w) => w !== target.word && !family.includes(w))
    )[0];
    const options = shuffle([
      ...familyWords.map((w) => ({ label: w, correct: false })),
      { label: outsider, correct: true },
    ]);
    return { prompt: `Main word: ${target.word}. Which word is NOT in this family?`, options, answer: outsider };
  }

  if (quizType === "group_to_word") {
    const prompt = `Pick the best word for: ${target.group}`;
    const sameGroup = session.pool.filter((w) => w.group === target.group && w.word !== target.word);
    const distractors = shuffle([...sameGroup, ...session.pool.filter((w) => w.group !== target.group)]).slice(0, 3);
    const options = shuffle([target, ...distractors]).map((w) => ({ label: w.word, correct: w.word === target.word }));
    return { prompt, options, answer: target.word };
  }

  const prompt = `Choose the best meaning group for: ${target.word}`;
  const allGroups = [...new Set(session.pool.map((w) => w.group))].filter((g) => g !== target.group);
  const wrongGroups = shuffle(allGroups).slice(0, 3);
  const options = shuffle([{ label: target.group, correct: true }, ...wrongGroups.map((g) => ({ label: g, correct: false }))]);
  return { prompt, options, answer: target.group };
}

function nextQuestion() {
  if (!session) return;
  if (session.qNo >= session.maxQ) {
    endQuiz();
    return;
  }

  const target = pickQuestionWord();
  const q = buildQuestion(target);

  session.active = { target, q, answered: false };
  session.qNo += 1;
  session.askedWords.push(target.word);
  session.wordAskCount[target.word] = (session.wordAskCount[target.word] || 0) + 1;

  el.qInfo.textContent = `Q ${session.qNo}/${session.maxQ}`;
  el.scoreInfo.textContent = `Score: ${session.correct}`;
  el.accuracyInfo.textContent = `Accuracy: ${Math.round((session.correct / Math.max(1, session.qNo - 1)) * 100)}%`;
  el.progressBar.style.width = `${Math.round((session.qNo / session.maxQ) * 100)}%`;
  el.prompt.textContent = q.prompt;
  el.feedback.textContent = "";
  el.feedback.className = "feedback";
  el.familyHint.textContent = "";
  el.nextBtn.disabled = true;
  renderChoices(q.options);
}

function renderChoices(options) {
  el.choices.innerHTML = "";
  options.forEach((opt) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.textContent = opt.label;
    b.addEventListener("click", () => answerQuestion(opt, b));
    el.choices.appendChild(b);
  });
}

function answerQuestion(opt, btn) {
  if (!session || session.active.answered) return;

  session.active.answered = true;
  const { target, q } = session.active;
  const s = getWordStats(target.word);
  s.seen += 1;
  s.lastSeenAt = session.qNo;

  [...el.choices.children].forEach((node) => {
    node.disabled = true;
    if (node.textContent === q.answer) node.classList.add("correct");
  });

  if (opt.correct) {
    session.correct += 1;
    s.correct += 1;
    s.streak += 1;
    el.feedback.textContent = "Correct.";
    el.feedback.classList.add("ok");
  } else {
    btn.classList.add("wrong");
    s.wrong += 1;
    s.streak = 0;
    s.lastWrongAt = session.qNo;
    session.retryQueue.push(target.word, target.word);
    session.wrongThisSession[target.word] = (session.wrongThisSession[target.word] || 0) + 1;
    el.feedback.textContent = `Incorrect. Correct answer: ${q.answer}`;
    el.feedback.classList.add("bad");
  }

  updateMastery(s);
  saveStats();
  el.scoreInfo.textContent = `Score: ${session.correct}`;
  el.accuracyInfo.textContent = `Accuracy: ${Math.round((session.correct / session.qNo) * 100)}%`;
  showFamilyHint(target.word);
  el.nextBtn.disabled = false;
}

function showFamilyHint(word) {
  const family = (session && session.families.byWord[word])
    ? session.families.byWord[word].slice(0, 8)
    : [];

  if (family.length) {
    el.familyHint.textContent = `Family words: ${family.join(", ")}`;
    return;
  }

  const base = word.slice(0, 4);
  const fallback = WORDS.map((w) => w.word).filter((w) => w !== word && (w.startsWith(base) || sharedPrefix(word, w) >= 5)).slice(0, 6);
  el.familyHint.textContent = fallback.length ? `Word family hint: ${fallback.join(", ")}` : "";
}

function sharedPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

function endQuiz() {
  if (!session) return;

  const total = session.qNo;
  const acc = Math.round((session.correct / Math.max(1, total)) * 100);
  const wrongSorted = Object.entries(session.wrongThisSession).sort((a, b) => b[1] - a[1]).slice(0, 15);

  el.quizPanel.classList.add("hidden");
  el.summaryPanel.classList.remove("hidden");
  el.summaryText.textContent = `You answered ${session.correct}/${total} correctly (${acc}%).`;

  el.stuckWords.innerHTML = "";
  if (!wrongSorted.length) {
    el.stuckWords.textContent = "No stuck words in this session.";
  } else {
    wrongSorted.forEach(([w, n]) => {
      const chip = document.createElement("span");
      chip.textContent = `${w} (missed ${n}x)`;
      el.stuckWords.appendChild(chip);
    });
  }

  session = null;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildFamilies(pool) {
  const byGroup = {};
  pool.forEach((w) => {
    if (!w.antonym) {
      byGroup[w.group] = byGroup[w.group] || [];
      if (!byGroup[w.group].includes(w.word)) byGroup[w.group].push(w.word);
    }
  });

  const byWord = {};
  Object.values(byGroup).forEach((words) => {
    if (words.length < 3) return;
    words.forEach((w) => {
      byWord[w] = words.filter((x) => x !== w);
    });
  });

  return { byGroup, byWord };
}
