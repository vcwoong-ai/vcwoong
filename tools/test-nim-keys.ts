/**
 * NIM 모델별 API 키 해석 로직 검증 (네트워크 없음).
 *
 * 배경: 실사용 중 확인된 것 — 이 NIM 계정은 모델 하나당 키가 따로
 * 발급되는 구조라, 공용 키로 다른 모델을 호출하면 404
 * ("Function ... Not found for account")가 났다. NIM_MODEL_KEYS(모델
 * ID → 키 JSON)로 모델별 키를 등록하면 callNimModel이 그 모델에 맞는
 * 키를 자동으로 고르게 했는데, 이 우선순위·오류 처리가 계약대로 동작
 * 하는지 확인한다.
 *
 * Usage: npm run test:nim-keys
 */
import { resolveApiKeyForModel, isNimConfigured } from "../src/lib/nim";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** 각 테스트가 서로의 env를 오염시키지 않게 실행 전후로 복원한다 */
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) prev[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function testPerModelKeyTakesPriority() {
  withEnv(
    {
      NVIDIA_NIM_API_KEY: "nvapi-fallback",
      NIM_MODEL_KEYS: JSON.stringify({ "vendor/model-a": "nvapi-model-a-key" }),
    },
    () => {
      assert(
        resolveApiKeyForModel("vendor/model-a") === "nvapi-model-a-key",
        "모델 전용 키가 있는데 공용 키를 씀"
      );
    }
  );
  console.log("✅ 모델별 키가 등록돼 있으면 공용 키보다 우선 사용");
}

function testFallsBackToSharedKey() {
  withEnv(
    {
      NVIDIA_NIM_API_KEY: "nvapi-fallback",
      NIM_MODEL_KEYS: JSON.stringify({ "vendor/model-a": "nvapi-model-a-key" }),
    },
    () => {
      assert(
        resolveApiKeyForModel("vendor/model-b") === "nvapi-fallback",
        "등록 안 된 모델인데 공용 키로 폴백하지 않음"
      );
    }
  );
  console.log("✅ 모델별 키가 없는 모델은 공용 키로 폴백");
}

function testThrowsWhenNoKeyAvailable() {
  withEnv({ NVIDIA_NIM_API_KEY: undefined, NIM_MODEL_KEYS: undefined }, () => {
    let threw = false;
    try {
      resolveApiKeyForModel("vendor/model-a");
    } catch {
      threw = true;
    }
    assert(threw, "키가 하나도 없는데 예외를 안 던짐");
  });
  console.log("✅ 공용 키·모델별 키 둘 다 없으면 명확히 예외를 던짐");
}

function testMalformedJsonIsIgnoredNotThrown() {
  // .env.local에 JSON을 손으로 채우다 오타가 나는 건 흔한 실수다 —
  // 이것 때문에 스크립트 전체가 죽으면 안 되고, 공용 키로 폴백해야 한다.
  withEnv(
    { NVIDIA_NIM_API_KEY: "nvapi-fallback", NIM_MODEL_KEYS: "{not valid json" },
    () => {
      assert(
        resolveApiKeyForModel("vendor/model-a") === "nvapi-fallback",
        "NIM_MODEL_KEYS가 깨진 JSON일 때 공용 키로 폴백하지 않음(예외가 새어나감)"
      );
    }
  );
  console.log("✅ NIM_MODEL_KEYS가 깨진 JSON이어도 죽지 않고 공용 키로 폴백");
}

function testIsNimConfiguredAcceptsEitherKeyStyle() {
  withEnv({ NVIDIA_NIM_API_KEY: undefined, NIM_MODEL_KEYS: undefined }, () => {
    assert(!isNimConfigured(), "키가 하나도 없는데 설정된 것으로 판단됨");
  });
  withEnv({ NVIDIA_NIM_API_KEY: "nvapi-x", NIM_MODEL_KEYS: undefined }, () => {
    assert(isNimConfigured(), "공용 키만 있는데 미설정으로 판단됨");
  });
  withEnv(
    { NVIDIA_NIM_API_KEY: undefined, NIM_MODEL_KEYS: '{"a/b":"nvapi-x"}' },
    () => {
      assert(isNimConfigured(), "모델별 키만 있는데 미설정으로 판단됨");
    }
  );
  console.log("✅ 공용 키·모델별 키 중 하나만 있어도 '설정됨'으로 인식");
}

function main() {
  console.log("\n=== DealMind NIM 모델별 키 해석 테스트 ===\n");
  testPerModelKeyTakesPriority();
  testFallsBackToSharedKey();
  testThrowsWhenNoKeyAvailable();
  testMalformedJsonIsIgnoredNotThrown();
  testIsNimConfiguredAcceptsEitherKeyStyle();
  console.log("\n✅ NIM 모델별 키 해석 테스트 통과\n");
}

main();
