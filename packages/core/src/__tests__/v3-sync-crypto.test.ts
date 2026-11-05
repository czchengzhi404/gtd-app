import { describe, expect, test } from "bun:test";

import {
  base64FromString,
  bytesToBase64,
  hmacSha256Hex,
  sha256Hex,
  toHex,
  utf8ToBytes,
} from "../sync/crypto";

describe("sha256", () => {
  test("空串（NIST 向量）", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  test("abc（NIST 向量）", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("448 位边界（NIST 向量）", () => {
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  test("中文按 UTF-8 编码后摘要", () => {
    // echo -n 清单 | sha256sum
    expect(sha256Hex("清单")).toBe(sha256Hex(utf8ToBytes("清单")));
    expect(utf8ToBytes("清单")).toHaveLength(6);
  });
});

describe("hmacSha256", () => {
  test("RFC 4231 case 1", () => {
    const key = new Uint8Array(20).fill(0x0b);
    expect(hmacSha256Hex(key, "Hi There")).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    );
  });

  test("RFC 4231 case 2（key 短于 block）", () => {
    expect(hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  test("S3 签名链：key 为字节、message 为文本", () => {
    const first = hmacSha256Hex("AWS4secret", "20261104");
    const second = hmacSha256Hex(new Uint8Array(Buffer.from(first, "hex")), "us-east-1");
    expect(second).toHaveLength(64);
    expect(second).not.toBe(first);
  });
});

describe("base64", () => {
  test("ASCII", () => {
    expect(base64FromString("user:pass")).toBe("dXNlcjpwYXNz");
  });

  test("需要补一个等号", () => {
    expect(base64FromString("ab")).toBe("YWI=");
  });

  test("需要补两个等号", () => {
    expect(base64FromString("a")).toBe("YQ==");
  });

  test("中文用户名（UTF-8）", () => {
    expect(base64FromString("张三:密码")).toBe(
      Buffer.from("张三:密码", "utf8").toString("base64"),
    );
  });

  test("空串", () => {
    expect(bytesToBase64(new Uint8Array())).toBe("");
  });
});

describe("toHex", () => {
  test("补零到两位", () => {
    expect(toHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe("00010f10ff");
  });
});
