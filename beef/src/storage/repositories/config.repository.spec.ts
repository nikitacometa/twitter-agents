import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../database.js';
import { ConfigRepository } from './config.repository.js';
import { logger } from '@common/utils/logger.js';

describe('ConfigRepository', () => {
  let tmpDir: string;
  let repo: ConfigRepository;
  let db: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-config-test-'));
    db = createDatabase(join(tmpDir, 'test.db'), logger);
    repo = new ConfigRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('approveMentions', () => {
    it('inherits from approveMode when not explicitly set', () => {
      repo.setApproveMode(true);
      const runtime = repo.getRuntime();
      expect(runtime.approveMode).toBe(true);
      expect(runtime.approveMentions).toBe(true);
    });

    it('inherits false from approveMode when not explicitly set', () => {
      repo.setApproveMode(false);
      const runtime = repo.getRuntime();
      expect(runtime.approveMode).toBe(false);
      expect(runtime.approveMentions).toBe(false);
    });

    it('can be set independently from approveMode', () => {
      repo.setApproveMode(true);
      repo.setApproveMentions(false);
      const runtime = repo.getRuntime();
      expect(runtime.approveMode).toBe(true);
      expect(runtime.approveMentions).toBe(false);
    });

    it('can be enabled while approveMode is disabled', () => {
      repo.setApproveMode(false);
      repo.setApproveMentions(true);
      const runtime = repo.getRuntime();
      expect(runtime.approveMode).toBe(false);
      expect(runtime.approveMentions).toBe(true);
    });

    it('persists value across getRuntime calls', () => {
      repo.setApproveMentions(true);
      expect(repo.getRuntime().approveMentions).toBe(true);
      repo.setApproveMentions(false);
      expect(repo.getRuntime().approveMentions).toBe(false);
    });
  });

  describe('getRuntime defaults', () => {
    it('returns correct defaults for fresh database', () => {
      const runtime = repo.getRuntime();
      expect(runtime.paused).toBe(false);
      expect(runtime.dailyLimit).toBe(10);
      expect(runtime.mentionSinceId).toBeNull();
      expect(runtime.moderationMode).toBe(true);
      expect(runtime.approveMode).toBe(false);
      expect(runtime.approveMentions).toBe(false);
    });
  });
});
