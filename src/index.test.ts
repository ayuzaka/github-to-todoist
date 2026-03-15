import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { validateEnv } from "./index.js";

describe(validateEnv, () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_TOKEN", "gh_token");
    vi.stubEnv("GITHUB_PROJECT_NUMBER", "42");
    vi.stubEnv("GITHUB_PROJECT_OWNER", "owner");
    vi.stubEnv("TODOIST_TOKEN", "tod_token");
    vi.stubEnv("TODOIST_PROJECT_ID", "proj_001");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("全ての必須環境変数が揃っている場合、設定を返す", () => {
    // Act
    const result = validateEnv();
    // Assert
    expect(result.githubToken).toBe("gh_token");
    expect(result.githubProjectNumber).toBe(42);
    expect(result.githubProjectOwner).toBe("owner");
    expect(result.todoistToken).toBe("tod_token");
    expect(result.todoistProjectId).toBe("proj_001");
  });

  test("GITHUB_TOKEN が未設定の場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("GITHUB_TOKEN", "");
    // Act & Assert
    expect(() => validateEnv()).toThrow("GITHUB_TOKEN");
  });

  test("GITHUB_PROJECT_NUMBER が未設定の場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("GITHUB_PROJECT_NUMBER", "");
    // Act & Assert
    expect(() => validateEnv()).toThrow("GITHUB_PROJECT_NUMBER");
  });

  test("GITHUB_PROJECT_OWNER が未設定の場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("GITHUB_PROJECT_OWNER", "");
    // Act & Assert
    expect(() => validateEnv()).toThrow("GITHUB_PROJECT_OWNER");
  });

  test("TODOIST_TOKEN が未設定の場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("TODOIST_TOKEN", "");
    // Act & Assert
    expect(() => validateEnv()).toThrow("TODOIST_TOKEN");
  });

  test("TODOIST_PROJECT_ID が未設定の場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("TODOIST_PROJECT_ID", "");
    // Act & Assert
    expect(() => validateEnv()).toThrow("TODOIST_PROJECT_ID");
  });

  test("GITHUB_PROJECT_NUMBER が数値でない場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("GITHUB_PROJECT_NUMBER", "not_a_number");
    // Act & Assert
    expect(() => validateEnv()).toThrow("GITHUB_PROJECT_NUMBER");
  });
});
