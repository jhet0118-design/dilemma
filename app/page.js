"use client";

import { useEffect, useMemo, useState } from "react";

const LS_TEACHER = "pd_teacher_v1";
const LS_STUDENT = "pd_student_v1";

// ---------- pure helpers ----------

function fmtChoice(c) {
  return c === "C" ? "협력" : "배신";
}

function outcomeText(mine, theirs) {
  if (mine === "C" && theirs === "C") return "서로를 믿었고, 함께 이득을 얻었어요.";
  if (mine === "D" && theirs === "D") return "둘 다 배신해서, 서로 손해를 봤어요.";
  if (mine === "D" && theirs === "C") return "상대의 신뢰를 이용해 더 큰 이득을 챙겼어요.";
  return "상대를 믿었지만, 배신당했어요.";
}

function totalScore(player) {
  if (!player?.points) return 0;
  return Object.values(player.points).reduce((s, v) => s + (v || 0), 0);
}

function myPairInfo(round, myId) {
  if (!round?.pairs) return null;
  for (const pr of round.pairs) {
    if (pr.a === myId) return { partnerId: pr.bye ? null : pr.b, bye: !!pr.bye };
    if (pr.b === myId) return { partnerId: pr.a, bye: false };
  }
  return null;
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

// ---------- root component ----------

export default function Page() {
  const [role, setRole] = useState(null); // 'teacher' | 'student'
  const [screen, setScreen] = useState("role");
  const [code, setCode] = useState("");
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState("");
  const [data, setData] = useState(null); // { meta, players, round, moves }
  const [notFound, setNotFound] = useState(false);
  const [joinErr, setJoinErr] = useState("");
  const [createErr, setCreateErr] = useState("");

  // resume a saved session on first load
  useEffect(() => {
    try {
      const t = JSON.parse(localStorage.getItem(LS_TEACHER) || "null");
      if (t?.code) {
        setRole("teacher");
        setCode(t.code);
        setScreen("t-lobby");
        return;
      }
    } catch {}
    try {
      const s = JSON.parse(localStorage.getItem(LS_STUDENT) || "null");
      if (s?.code && s?.myId) {
        setRole("student");
        setCode(s.code);
        setMyId(s.myId);
        setMyName(s.name || "");
        setScreen("s-play");
      }
    } catch {}
  }, []);

  const pollMs = useMemo(() => {
    if (!data?.meta) return 2500;
    if (data.meta.status !== "playing") return 3000;
    const pair = myPairInfo(data.round, myId);
    if (pair) {
      const myMove = data.moves?.[myId];
      if (myMove) {
        const oppMove = pair.bye ? myMove : data.moves?.[pair.partnerId];
        if (!oppMove) return 1200; // waiting on partner: poll fast
      }
    }
    return 2200;
  }, [data, myId]);

  useEffect(() => {
    if (!code) return;
    let active = true;
    async function tick() {
      try {
        const res = await fetch(`/api/session/${code}`, { cache: "no-store" });
        if (res.status === 404) {
          if (active) setNotFound(true);
          return;
        }
        const json = await res.json();
        if (active) {
          setData(json);
          setNotFound(false);
        }
      } catch {}
    }
    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [code, pollMs]);

  function leaveToRoleScreen() {
    localStorage.removeItem(LS_TEACHER);
    localStorage.removeItem(LS_STUDENT);
    setRole(null);
    setCode("");
    setMyId(null);
    setData(null);
    setNotFound(false);
    setScreen("role");
  }

  async function createGame(cfg) {
    setCreateErr("");
    const res = await postJSON("/api/session", cfg);
    if (!res.ok) {
      setCreateErr("게임을 만들지 못했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    const { code: newCode } = await res.json();
    localStorage.setItem(LS_TEACHER, JSON.stringify({ code: newCode }));
    setCode(newCode);
    setRole("teacher");
    setScreen("t-lobby");
  }

  async function joinGame(codeInput, nameInput) {
    setJoinErr("");
    const c = codeInput.trim();
    const name = nameInput.trim();
    if (!/^\d{4}$/.test(c)) {
      setJoinErr("4자리 코드를 정확히 입력해주세요.");
      return;
    }
    if (!name) {
      setJoinErr("별명을 입력해주세요.");
      return;
    }
    const res = await postJSON(`/api/session/${c}/join`, { name });
    if (res.status === 404) {
      setJoinErr("해당 코드의 게임을 찾을 수 없어요. 코드를 다시 확인해주세요.");
      return;
    }
    if (!res.ok) {
      setJoinErr("참여에 실패했어요. 다시 시도해주세요.");
      return;
    }
    const { playerId } = await res.json();
    localStorage.setItem(LS_STUDENT, JSON.stringify({ code: c, myId: playerId, name }));
    setCode(c);
    setMyId(playerId);
    setMyName(name);
    setRole("student");
    setScreen("s-play");
  }

  async function startGame() {
    await postJSON(`/api/session/${code}/start`);
  }
  async function nextRound() {
    await postJSON(`/api/session/${code}/next`);
  }
  async function chooseMove(choice) {
    await postJSON(`/api/session/${code}/move`, { playerId: myId, choice });
  }

  return (
    <div className="wrap">
      {screen === "role" && <RoleSelect onPick={(r) => setScreen(r === "teacher" ? "t-setup" : "s-join")} />}

      {screen === "s-join" && (
        <StudentJoin err={joinErr} onJoin={joinGame} onBack={() => setScreen("role")} />
      )}

      {screen === "t-setup" && (
        <TeacherSetup err={createErr} onCreate={createGame} onBack={() => setScreen("role")} />
      )}

      {screen === "t-lobby" && (
        <TeacherLobby
          code={code}
          data={data}
          notFound={notFound}
          onStart={startGame}
          onNext={nextRound}
          onLeave={leaveToRoleScreen}
        />
      )}

      {screen === "s-play" && (
        <StudentPlay
          code={code}
          myId={myId}
          myName={myName}
          data={data}
          notFound={notFound}
          onChoose={chooseMove}
          onLeave={leaveToRoleScreen}
        />
      )}
    </div>
  );
}

// ---------- shared bits ----------

function Header({ eyebrow, title, lede }) {
  return (
    <div className="stack" style={{ marginBottom: 22 }}>
      <p className="eyebrow">{eyebrow}</p>
      <h1 style={{ fontSize: 30 }}>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
    </div>
  );
}

function Roster({ items }) {
  if (!items.length) return <p className="lede">아직 아무도 참여하지 않았어요.</p>;
  return (
    <ul className="roster">
      {items.map((it, i) => (
        <li key={i}>
          <span>{it.name}</span>
          {it.status && <span className="pill wait">{it.status}</span>}
        </li>
      ))}
    </ul>
  );
}

function Leaderboard({ players, myId }) {
  const ranked = [...players].sort((a, b) => totalScore(b) - totalScore(a));
  return (
    <div className="card stack">
      <h3 style={{ fontSize: 19 }}>최종 결과</h3>
      <table>
        <thead>
          <tr>
            <th>순위</th>
            <th>이름</th>
            <th style={{ textAlign: "right" }}>총점</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((p, i) => (
            <tr key={p.id} className={i === 0 ? "rank-1" : ""}>
              <td>{i + 1}</td>
              <td>
                {p.name}
                {p.id === myId ? " (나)" : ""}
              </td>
              <td style={{ textAlign: "right" }}>
                <span className="score-num">{totalScore(p)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="lede">
        누적 배신이 많을수록 처음엔 이득처럼 보여도, 반복된 만남에서는 서로 신뢰한 짝이 더 오래, 더 크게
        이득을 봤는지 함께 이야기해보세요.
      </p>
    </div>
  );
}

// ---------- screens ----------

function RoleSelect({ onPick }) {
  return (
    <>
      <Header
        eyebrow="죄수의 딜레마 · 교실 실험"
        title="딜레마 교실"
        lede="학급 전체가 동시에 짝을 지어 협력과 배신을 선택하는 실시간 게임이에요. 선생님이 게임을 만들고, 학생들은 코드로 참여해요."
      />
      <div className="role-pick">
        <div className="card role-card" onClick={() => onPick("teacher")}>
          <span className="glyph">🗂️</span>
          <h3 style={{ fontSize: 19, marginTop: 10 }}>선생님으로 시작</h3>
          <p className="lede" style={{ marginTop: 6 }}>
            게임을 만들고 반 전체의 진행을 관리해요.
          </p>
        </div>
        <div className="card role-card" onClick={() => onPick("student")}>
          <span className="glyph">🧑‍🎓</span>
          <h3 style={{ fontSize: 19, marginTop: 10 }}>학생으로 참여</h3>
          <p className="lede" style={{ marginTop: 6 }}>
            선생님이 알려준 코드로 게임에 들어가요.
          </p>
        </div>
      </div>
      <p className="lede" style={{ marginTop: 18, fontSize: 13 }}>
        로그인이나 회원가입은 필요 없어요 — 학생은 코드와 별명만 입력하면 바로 참여할 수 있어요.
      </p>
    </>
  );
}

function StudentJoin({ err, onJoin, onBack }) {
  const [codeInput, setCodeInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  return (
    <>
      <Header
        eyebrow="학생 참여"
        title="게임 코드를 입력하세요"
        lede="선생님이 화면에 띄운 4자리 코드와 별명을 입력하면 대기실로 들어가요."
      />
      <div className="card stack">
        <div>
          <label>게임 코드</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="예: 4821"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div>
          <label>내 별명</label>
          <input
            type="text"
            maxLength={14}
            placeholder="예: 은지"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
          />
        </div>
        {err && <p className="err">{err}</p>}
        <button className="primary" onClick={() => onJoin(codeInput, nameInput)}>
          참여하기
        </button>
        <button className="ghost foot-link" onClick={onBack}>
          ← 뒤로
        </button>
      </div>
    </>
  );
}

function TeacherSetup({ err, onCreate, onBack }) {
  const [rounds, setRounds] = useState(6);
  const [pairingMode, setPairingMode] = useState("fixed");
  const [R, setR] = useState(3);
  const [P, setP] = useState(1);
  const [T, setT] = useState(5);
  const [S, setS] = useState(0);

  return (
    <>
      <Header
        eyebrow="선생님 설정"
        title="새 게임 만들기"
        lede="라운드 수, 짝 배정 방식, 점수표를 정한 뒤 게임을 만드세요. 만든 뒤에는 라운드 수를 바꿀 수 없어요."
      />
      <div className="card stack">
        <div className="row">
          <div>
            <label>총 라운드 수</label>
            <input
              type="number"
              min={1}
              max={20}
              value={rounds}
              onChange={(e) => setRounds(e.target.value)}
            />
          </div>
          <div>
            <label>짝 배정 방식</label>
            <select value={pairingMode} onChange={(e) => setPairingMode(e.target.value)}>
              <option value="fixed">고정 짝 (매 라운드 같은 상대 — 반복 딜레마)</option>
              <option value="random">무작위 짝 (매 라운드 다른 상대 — 1회성 딜레마)</option>
            </select>
          </div>
        </div>
        <div>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            점수표 (각자 얻는 점수)
          </p>
          <div className="matrix-grid">
            <div>
              <label>둘 다 협력하면 각자</label>
              <input type="number" value={R} onChange={(e) => setR(e.target.value)} />
            </div>
            <div>
              <label>둘 다 배신하면 각자</label>
              <input type="number" value={P} onChange={(e) => setP(e.target.value)} />
            </div>
            <div>
              <label>나만 배신했다면 나는</label>
              <input type="number" value={T} onChange={(e) => setT(e.target.value)} />
            </div>
            <div>
              <label>나만 협력했다면 나는</label>
              <input type="number" value={S} onChange={(e) => setS(e.target.value)} />
            </div>
          </div>
        </div>
        {err && <p className="err">{err}</p>}
        <button
          className="primary"
          onClick={() => onCreate({ totalRounds: rounds, pairingMode, payoff: { R, P, T, S } })}
        >
          게임 만들기
        </button>
        <button className="ghost foot-link" onClick={onBack}>
          ← 뒤로
        </button>
      </div>
    </>
  );
}

function TeacherLobby({ code, data, notFound, onStart, onNext, onLeave }) {
  if (notFound) {
    return (
      <div className="card stack">
        <p className="err">이 게임을 더 이상 찾을 수 없어요 (시간이 지나 만료되었을 수 있어요).</p>
        <button className="primary" onClick={onLeave}>
          새 게임 만들기
        </button>
      </div>
    );
  }
  if (!data) return <p className="lede pulse">게임 정보를 불러오는 중…</p>;

  const { meta, players, round, moves } = data;
  const pm = Object.fromEntries(players.map((p) => [p.id, p]));

  return (
    <>
      <Header eyebrow="선생님 화면" title="죄수의 딜레마 진행 중" />
      <div className="card center" style={{ marginBottom: 18 }}>
        <p className="eyebrow">게임 코드</p>
        <span className="code-stamp">{code}</span>
        <p className="lede">학생들이 이 코드와 별명으로 참여해요.</p>
      </div>

      {meta.status === "lobby" && (
        <div className="card stack">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 18 }}>참여자 ({players.length}명)</h3>
            <span className="badge">대기중</span>
          </div>
          <Roster items={players.map((p) => ({ name: p.name }))} />
          <button className="primary" disabled={players.length < 2} onClick={onStart}>
            게임 시작하기
          </button>
          {players.length < 2 && <p className="lede">최소 2명이 참여해야 시작할 수 있어요.</p>}
        </div>
      )}

      {meta.status === "playing" && (
        <div className="card stack">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 18 }}>
              라운드 {meta.currentRound} / {meta.totalRounds}
            </h3>
          </div>
          <ul className="roster">
            {(round?.pairs || []).map((pr, i) => {
              const aName = pm[pr.a]?.name || "?";
              const aDone = !!moves[pr.a];
              if (pr.bye) {
                return (
                  <li key={i}>
                    <span>
                      {aName} <span className="badge" style={{ marginLeft: 6 }}>🤖 컴퓨터 상대</span>
                    </span>
                    <span className={`pill ${aDone ? "done" : "wait"}`}>{aDone ? "완료" : "대기"}</span>
                  </li>
                );
              }
              const bName = pm[pr.b]?.name || "?";
              const bDone = !!moves[pr.b];
              return (
                <li key={i}>
                  <span>
                    {aName} ↔ {bName}
                  </span>
                  <span className={`pill ${aDone && bDone ? "done" : "wait"}`}>
                    {aDone && bDone ? "완료" : `${(aDone ? 1 : 0) + (bDone ? 1 : 0)}명 제출`}
                  </span>
                </li>
              );
            })}
          </ul>
          <button className="primary" onClick={onNext}>
            {meta.currentRound >= meta.totalRounds ? "게임 종료하고 결과 보기" : "다음 라운드로"}
          </button>
        </div>
      )}

      {meta.status === "finished" && <Leaderboard players={players} myId={null} />}
    </>
  );
}

function StudentPlay({ code, myId, myName, data, notFound, onChoose, onLeave }) {
  if (notFound) {
    return (
      <div className="card stack">
        <p className="err">이 게임을 더 이상 찾을 수 없어요 (시간이 지나 만료되었을 수 있어요).</p>
        <button className="primary" onClick={onLeave}>
          다시 참여하기
        </button>
      </div>
    );
  }
  if (!data) return <p className="lede pulse">연결하는 중…</p>;

  const { meta, players, round, moves } = data;
  const pm = Object.fromEntries(players.map((p) => [p.id, p]));
  const me = pm[myId];

  if (meta.status === "lobby") {
    return (
      <>
        <Header eyebrow="대기실" title={`곧 시작해요, ${myName}님`} lede="선생님이 게임을 시작하면 자동으로 첫 라운드가 시작돼요." />
        <div className="card center" style={{ marginBottom: 18 }}>
          <span className="code-stamp" style={{ fontSize: 32 }}>
            {code}
          </span>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>함께 참여 중 ({players.length}명)</h3>
          <Roster items={players.map((p) => ({ name: p.name + (p.id === myId ? " (나)" : "") }))} />
        </div>
      </>
    );
  }

  if (meta.status === "finished") {
    return (
      <>
        <Header eyebrow="게임 종료" title={`수고했어요, ${myName}님`} />
        <Leaderboard players={players} myId={myId} />
      </>
    );
  }

  // playing
  const pair = myPairInfo(round, myId);
  if (!pair) {
    return (
      <>
        <Header eyebrow="잠시만요" title="다음 라운드를 준비하고 있어요" />
        <div className="card center">
          <p className="lede pulse">배정을 기다리는 중…</p>
        </div>
      </>
    );
  }

  const myMove = moves[myId];
  const oppId = pair.partnerId;
  const oppMove = pair.bye ? (myMove ? { choice: myMove.botChoice } : null) : oppId ? moves[oppId] : null;
  const oppName = pair.bye ? "🤖 컴퓨터" : pm[oppId]?.name || "상대";

  return (
    <>
      <Header
        eyebrow={`라운드 ${meta.currentRound} / ${meta.totalRounds}`}
        title={`상대: ${oppName}`}
        lede={pair.bye ? "이번 라운드는 인원이 홀수라 컴퓨터와 대결해요." : "동시에 선택하고, 둘 다 선택하면 결과가 공개돼요."}
      />

      {!myMove && (
        <div className="doors">
          <div className="door coop" onClick={() => onChoose("C")}>
            <span className="glyph">🤝</span>
            <span className="label">협력</span>
            <span className="sub">함께 신뢰를 지켜요</span>
          </div>
          <div className="door betray" onClick={() => onChoose("D")}>
            <span className="glyph">🗡️</span>
            <span className="label">배신</span>
            <span className="sub">혼자 이득을 노려요</span>
          </div>
        </div>
      )}

      {myMove && !oppMove && (
        <div className="card center stack">
          <p className="eyebrow">내 선택</p>
          <h2 style={{ fontSize: 22 }}>{fmtChoice(myMove.choice)}</h2>
          <p className="lede pulse">상대의 선택을 기다리는 중…</p>
        </div>
      )}

      {myMove && oppMove && (
        <div className="card">
          <div className="reveal-pair">
            <div className={`reveal-slot ${myMove.choice === "C" ? "coop" : "betray"}`}>
              나
              <br />
              {fmtChoice(myMove.choice)}
            </div>
            <span className="reveal-vs">VS</span>
            <div className={`reveal-slot ${oppMove.choice === "C" ? "coop" : "betray"}`}>
              {oppName}
              <br />
              {fmtChoice(oppMove.choice)}
            </div>
          </div>
          <p className="lede center">{outcomeText(myMove.choice, oppMove.choice)}</p>
          <div className="score-row">
            <span>이번 라운드 점수</span>
            <span className="score-num">+{me?.points?.[meta.currentRound] ?? "…"}</span>
          </div>
          <div className="score-row">
            <span>누적 점수</span>
            <span className="score-num">{totalScore(me)}</span>
          </div>
          <p className="lede center" style={{ marginTop: 14 }}>
            선생님이 다음 라운드를 시작할 때까지 기다려주세요.
          </p>
        </div>
      )}
    </>
  );
}
