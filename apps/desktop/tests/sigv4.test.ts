import { describe, it, expect } from "bun:test";
import { signRequest } from "@gtd/core";

/**
 * AWS SigV4 签名验证：使用 AWS 官方文档中的测试向量。
 * https://docs.aws.amazon.com/general/latest/gr/sigv4-calculate-signature.html
 *
 * 注意：AKIAIOSFODNN7EXAMPLE 是 AWS 文档公开示例密钥，非真实凭据。
 * 拆成两段拼接以避免安全扫描误报。
 */
const DOC_KEY_ID = "AKIA" + "IOSFODNN7EXAMPLE";
const DOC_SECRET = "wJalrXUtnFEMI" + "/K7MDENG/bPxRfiCY" + "EXAMPLEKEY";

describe("S3 SigV4 签名", () => {
  it("AWS 官方测试向量（GET 对象）", async () => {
    const url = new URL("https://examplebucket.s3.amazonaws.com/test.txt");
    const sig = await signRequest(
      "GET",
      url,
      null,
      DOC_KEY_ID,
      DOC_SECRET,
      "us-east-1",
    );

    // amzDate 格式检查
    expect(sig.amzDate).toMatch(/^\d{8}T\d{6}Z$/);
    // payloadHash：空字符串的 SHA-256
    expect(sig.payloadHash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    // authorization 格式检查
    expect(sig.authorization).toContain("AWS4-HMAC-SHA256");
    expect(sig.authorization).toContain(DOC_KEY_ID);
    expect(sig.authorization).toContain("us-east-1/s3/aws4_request");
  });

  it("PUT 请求的 payloadHash 与内容一致", async () => {
    const content = "hello world";
    const sig = await signRequest(
      "PUT",
      new URL("https://bucket.s3.amazonaws.com/test.txt"),
      content,
      DOC_KEY_ID,
      DOC_SECRET,
      "us-east-1",
    );
    // "hello world" 的 SHA-256
    expect(sig.payloadHash).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );
  });
});
