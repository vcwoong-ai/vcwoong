/* 체험판·랜딩 공용 예시 시나리오 (가상의 회사·투자자) */
(function (root) {
  'use strict';
  var 억 = 1e8;
  function example() {
    return {
      company: '(예시) 주식회사 그린랩',
      seniority: 'stacked',
      exitValue: 120 * 억,
      holders: [
        { name: '김대표', kind: 'common', shares: 6000000 },
        { name: '이CTO', kind: 'common', shares: 3000000 },
        { name: '초기 직원', kind: 'option', shares: 300000 },
        { name: '옵션풀(미부여)', kind: 'pool', shares: 700000 }
      ],
      rounds: [
        { type: 'safe', name: '액셀러레이터 SAFE', investors: [{ name: '○○액셀러레이터', amount: 2 * 억 }], cap: 30 * 억, discountPct: 20 },
        {
          type: 'priced', name: 'Seed', preMoney: 50 * 억, poolTargetPct: 10,
          investors: [{ name: '알파벤처스', amount: 10 * 억 }, { name: '엔젤 박○○', amount: 2 * 억 }],
          pref: { multiple: 1, participating: false, capMultiple: 0, antiDilution: 'broad', refixFloorPct: 70 }
        },
        {
          type: 'priced', name: 'Series A', preMoney: 200 * 억, poolTargetPct: 12,
          investors: [{ name: '베타인베스트먼트', amount: 40 * 억 }, { name: '알파벤처스', amount: 10 * 억 }],
          pref: { multiple: 1, participating: true, capMultiple: 3, antiDilution: 'broad', refixFloorPct: 70 }
        }
      ]
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = example;
  root.EquityExample = example;
})(typeof globalThis !== 'undefined' ? globalThis : this);
