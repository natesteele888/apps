// Made-up Firebase data for the Bengals screenshots: fictional first names only, fictional teams, example.com.
const fs = require('fs'), path = require('path');
module.exports = (APP_DIR) => {
  const cards = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'dev/data/cards.json'), 'utf8'));
  const plays = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'dev/data/plays.json'), 'utf8'));
  const g = (o) => Object.assign({ gameType: 'Regular Season', homeAway: 'Home', arriveTime: '', warmupTime: '', gameTime: '10:00', ourScore: '', oppScore: '', writeup: '', scouting: '', location: 'Memorial Field' }, o);
  const schedule = [
    g({ id: 'g1', week: 1, opponent: 'Lakeside Comets', date: '2026-09-13', ourScore: 21, oppScore: 7, writeup: 'Strong start. The line opened big holes and the defense forced three turnovers.' }),
    g({ id: 'g2', week: 2, opponent: 'Ridgeview Rockets', date: '2026-09-20', homeAway: 'Away', location: 'Ridgeview Park', gameTime: '12:00', ourScore: 14, oppScore: 12, writeup: 'A close one. Option pass won it late.' }),
    g({ id: 'g3', week: 3, opponent: '', date: '2026-09-27', gameType: 'Bye' }),
    g({ id: 'g4', week: 4, opponent: 'Hillcrest Lightning', date: '2026-10-04', ourScore: 6, oppScore: 13, writeup: 'Tough day. We bounce back next week.' }),
    g({ id: 'g5', week: 5, opponent: 'Eastgate Falcons', date: '2026-10-11', homeAway: 'Away', location: 'Eastgate High Field', gameTime: '11:00', ourScore: 28, oppScore: 0 }),
    g({ id: 'g6', week: 6, opponent: 'Valley Hawks', date: '2026-10-18', arriveTime: '08:45', warmupTime: '09:15', gameTime: '10:00', scouting: 'Run heavy to the left. Their #3 is fast, keep contain on the edge.' }),
    g({ id: 'g7', week: 7, opponent: 'Northfield Knights', date: '2026-10-25', homeAway: 'Away', location: 'Northfield Rec Complex', arriveTime: '10:45', warmupTime: '11:15', gameTime: '12:00' }),
    g({ id: 'g8', week: 8, opponent: 'Brookside Lions', date: '2026-11-01', gameTime: '10:00' }),
  ];
  const T = (team, w, l, pf, pa, powerRank, trend) => ({ team, division: 'Tackle 11U', wins: w, losses: l, ties: 0, pf, pa, diff: pf - pa, powerRank, trend });
  const standings = { updatedAt: '2026-10-12T20:00:00.000Z', rawText: '', teams: [
    T('Valley Hawks', 4, 1, 88, 41, 1, 0), T('Bengals', 3, 1, 69, 32, 2, 1), T('Hillcrest Lightning', 3, 2, 60, 49, 3, 2), T('Ridgeview Rockets', 3, 2, 61, 52, 4, 0),
    T('Eastgate Falcons', 2, 3, 40, 66, 5, -1), T('Lakeside Comets', 2, 3, 44, 66, 6, -1), T('Northfield Knights', 1, 4, 33, 71, 7, 0), T('Brookside Lions', 0, 5, 18, 79, 8, 0),
  ] };
  const names = [['Riley', 'QB', 1], ['Jordan', 'RB', 2], ['Casey', 'RB', 3], ['Morgan', 'WR', 4], ['Avery', 'TE', 5], ['Quinn', 'WR', 6], ['Sam', 'OL', 54], ['Jamie', 'OL', 62], ['Drew', 'OL', 70], ['Reese', 'OL', 73], ['Skyler', 'OL', 75], ['Parker', 'DL', 91], ['Rowan', 'DL', 95], ['Hayden', 'LB', 44], ['Emerson', 'LB', 48], ['Kendall', 'DB', 21], ['Finley', 'DB', 24]];
  const teamRoster = names.map(([name, position, num], i) => ({ id: 'r' + (i + 1), num: String(num), name, position }));
  const practices = [
    { id: 'pr1', type: 'practice', date: '2026-10-14', time: '17:30', endTime: '19:00', location: 'Memorial Field', notes: 'Pads on. Bring water.', updatedAt: '2026-10-10T12:00:00Z' },
    { id: 'pr2', type: 'practice', date: '2026-10-16', time: '17:30', endTime: '19:00', location: 'Memorial Field', notes: 'Walk through the game plan.', updatedAt: '2026-10-10T12:00:00Z' },
  ];
  const thisWeek = { gameId: 'g6', updatedAt: '2026-10-13T12:00:00Z', plays: [],
    coachKeys: [{ name: 'Coach Taylor', keys: ['Win the line of scrimmage', 'Run the ball left', 'No penalties'] }, { name: 'Coach Jordan', keys: ['Tackle in space', 'Contain the edge', 'Finish every play'] }] };
  return { dev2PlayData: { cards, plays }, schedule, standings, teamRoster, practices, thisWeek, opponentLogos: {}, whatsNew: {}, settings: {} };
};
