/** Tests for driveDag.ts - DAG builder with ownership tracking */
import { describe, it, expect } from 'vitest';
import { buildDriveDag, type DagNode, type DriveDag } from '../driveDag';
import type { FileItem } from '../../types/drive';

// =============================================================================
// Test Fixtures
// =============================================================================

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Create a minimal FileItem for testing */
function createFile(overrides: Partial<FileItem> & { id: string; name: string }): FileItem {
  return {
    mimeType: 'text/plain',
    parents: [],
    ...overrides,
  };
}

/** Create a folder FileItem */
function createFolder(overrides: Partial<FileItem> & { id: string; name: string }): FileItem {
  return createFile({ ...overrides, mimeType: FOLDER_MIME });
}

// =============================================================================
// DagNode ownedByMe Tests
// =============================================================================

describe('DagNode ownedByMe field', () => {
  it('should include ownedByMe in DagNode interface', () => {
    const files: FileItem[] = [
      createFile({ id: 'f1', name: 'test.txt', ownedByMe: true }),
    ];
    
    const dag = buildDriveDag(files);
    const node = dag.nodesById.get('f1');
    
    expect(node).toBeDefined();
    expect('ownedByMe' in node!).toBe(true);
  });

  it('should set ownedByMe: true when file.ownedByMe === true', () => {
    const files: FileItem[] = [
      createFile({ id: 'owned', name: 'my-file.txt', ownedByMe: true }),
    ];
    
    const dag = buildDriveDag(files);
    const node = dag.nodesById.get('owned');
    
    expect(node?.ownedByMe).toBe(true);
  });

  it('should set ownedByMe: false when file.ownedByMe === false', () => {
    const files: FileItem[] = [
      createFile({ id: 'shared', name: 'shared-file.txt', ownedByMe: false }),
    ];
    
    const dag = buildDriveDag(files);
    const node = dag.nodesById.get('shared');
    
    expect(node?.ownedByMe).toBe(false);
  });

  it('should default ownedByMe to true when undefined', () => {
    const files: FileItem[] = [
      createFile({ id: 'unknown', name: 'old-file.txt' }), // ownedByMe not set
    ];
    
    const dag = buildDriveDag(files);
    const node = dag.nodesById.get('unknown');
    
    expect(node?.ownedByMe).toBe(true);
  });

  it('should preserve ownedByMe across mixed ownership files', () => {
    const files: FileItem[] = [
      createFile({ id: 'mine1', name: 'my-doc.pdf', ownedByMe: true }),
      createFile({ id: 'shared1', name: 'team-doc.pdf', ownedByMe: false }),
      createFile({ id: 'mine2', name: 'my-notes.txt', ownedByMe: true }),
      createFile({ id: 'shared2', name: 'external.xlsx', ownedByMe: false }),
    ];
    
    const dag = buildDriveDag(files);
    
    expect(dag.nodesById.get('mine1')?.ownedByMe).toBe(true);
    expect(dag.nodesById.get('shared1')?.ownedByMe).toBe(false);
    expect(dag.nodesById.get('mine2')?.ownedByMe).toBe(true);
    expect(dag.nodesById.get('shared2')?.ownedByMe).toBe(false);
  });
});

// =============================================================================
// DagOwnershipStats Tests
// =============================================================================

describe('DagOwnershipStats', () => {
  it('should include ownershipStats in DriveDag', () => {
    const files: FileItem[] = [
      createFile({ id: 'f1', name: 'test.txt', ownedByMe: true }),
    ];
    
    const dag = buildDriveDag(files);
    
    expect(dag.ownershipStats).toBeDefined();
    expect('ownedCount' in dag.ownershipStats).toBe(true);
    expect('sharedCount' in dag.ownershipStats).toBe(true);
    expect('ownedSizeBytes' in dag.ownershipStats).toBe(true);
    expect('sharedSizeBytes' in dag.ownershipStats).toBe(true);
  });

  it('should count owned files correctly', () => {
    const files: FileItem[] = [
      createFile({ id: 'mine1', name: 'a.txt', ownedByMe: true }),
      createFile({ id: 'mine2', name: 'b.txt', ownedByMe: true }),
      createFile({ id: 'mine3', name: 'c.txt', ownedByMe: true }),
      createFile({ id: 'shared1', name: 'd.txt', ownedByMe: false }),
    ];
    
    const dag = buildDriveDag(files);
    
    expect(dag.ownershipStats.ownedCount).toBe(3);
  });

  it('should count shared files correctly', () => {
    const files: FileItem[] = [
      createFile({ id: 'mine1', name: 'a.txt', ownedByMe: true }),
      createFile({ id: 'shared1', name: 'b.txt', ownedByMe: false }),
      createFile({ id: 'shared2', name: 'c.txt', ownedByMe: false }),
      createFile({ id: 'shared3', name: 'd.txt', ownedByMe: false }),
    ];
    
    const dag = buildDriveDag(files);
    
    expect(dag.ownershipStats.sharedCount).toBe(3);
  });

  it('should sum owned file sizes correctly', () => {
    const files: FileItem[] = [
      createFile({ id: 'mine1', name: 'a.txt', ownedByMe: true, size: 100 }),
      createFile({ id: 'mine2', name: 'b.txt', ownedByMe: true, size: 200 }),
      createFile({ id: 'shared1', name: 'c.txt', ownedByMe: false, size: 1000 }),
    ];
    
    const dag = buildDriveDag(files);
    
    expect(dag.ownershipStats.ownedSizeBytes).toBe(300);
  });

  it('should sum shared file sizes correctly', () => {
    const files: FileItem[] = [
      createFile({ id: 'mine1', name: 'a.txt', ownedByMe: true, size: 100 }),
      createFile({ id: 'shared1', name: 'b.txt', ownedByMe: false, size: 500 }),
      createFile({ id: 'shared2', name: 'c.txt', ownedByMe: false, size: 750 }),
    ];
    
    const dag = buildDriveDag(files);
    
    expect(dag.ownershipStats.sharedSizeBytes).toBe(1250);
  });

  it('should use calculatedSize when available over size', () => {
    const files: FileItem[] = [
      createFolder({ id: 'folder1', name: 'folder', ownedByMe: true, calculatedSize: 5000 }),
      createFile({ id: 'file1', name: 'file.txt', ownedByMe: true, size: 100, calculatedSize: 100 }),
    ];
    
    const dag = buildDriveDag(files);
    
    expect(dag.ownershipStats.ownedSizeBytes).toBe(5100);
  });

  it('should handle empty file list', () => {
    const dag = buildDriveDag([]);
    
    expect(dag.ownershipStats.ownedCount).toBe(0);
    expect(dag.ownershipStats.sharedCount).toBe(0);
    expect(dag.ownershipStats.ownedSizeBytes).toBe(0);
    expect(dag.ownershipStats.sharedSizeBytes).toBe(0);
  });

  it('should handle files with no size', () => {
    const files: FileItem[] = [
      createFolder({ id: 'folder1', name: 'empty-folder', ownedByMe: true }),
      createFile({ id: 'shared1', name: 'gdoc.gdoc', ownedByMe: false }), // Google Docs have no size
    ];
    
    const dag = buildDriveDag(files);
    
    expect(dag.ownershipStats.ownedSizeBytes).toBe(0);
    expect(dag.ownershipStats.sharedSizeBytes).toBe(0);
    expect(dag.ownershipStats.ownedCount).toBe(1);
    expect(dag.ownershipStats.sharedCount).toBe(1);
  });

  it('should count undefined ownedByMe as owned (default true)', () => {
    const files: FileItem[] = [
      createFile({ id: 'legacy1', name: 'old1.txt' }), // no ownedByMe
      createFile({ id: 'legacy2', name: 'old2.txt' }), // no ownedByMe
      createFile({ id: 'shared1', name: 'new.txt', ownedByMe: false }),
    ];
    
    const dag = buildDriveDag(files);
    
    expect(dag.ownershipStats.ownedCount).toBe(2);
    expect(dag.ownershipStats.sharedCount).toBe(1);
  });
});

// =============================================================================
// Integration: Ownership with DAG Structure
// =============================================================================

describe('Ownership integration with DAG structure', () => {
  it('should track ownership across folder hierarchy', () => {
    const files: FileItem[] = [
      createFolder({ id: 'root', name: 'My Drive', ownedByMe: true }),
      createFolder({ id: 'shared_folder', name: 'Team Folder', ownedByMe: false, parents: ['root'] }),
      createFile({ id: 'my_file', name: 'my-doc.txt', ownedByMe: true, parents: ['root'] }),
      createFile({ id: 'shared_file', name: 'team-doc.txt', ownedByMe: false, parents: ['shared_folder'] }),
    ];
    
    const dag = buildDriveDag(files);
    
    // Verify DAG structure
    expect(dag.roots).toContain('root');
    expect(dag.childrenById.get('root')).toContain('shared_folder');
    expect(dag.childrenById.get('root')).toContain('my_file');
    
    // Verify ownership
    expect(dag.nodesById.get('root')?.ownedByMe).toBe(true);
    expect(dag.nodesById.get('shared_folder')?.ownedByMe).toBe(false);
    expect(dag.nodesById.get('my_file')?.ownedByMe).toBe(true);
    expect(dag.nodesById.get('shared_file')?.ownedByMe).toBe(false);
    
    // Verify stats
    expect(dag.ownershipStats.ownedCount).toBe(2);
    expect(dag.ownershipStats.sharedCount).toBe(2);
  });

  it('should handle shared files appearing as DAG roots', () => {
    // Shared files often have no parent in the user's dataset (orphaned)
    const files: FileItem[] = [
      createFolder({ id: 'my_root', name: 'My Drive', ownedByMe: true }),
      createFile({ id: 'shared_orphan', name: 'External Share', ownedByMe: false }), // No parent = root
    ];
    
    const dag = buildDriveDag(files);
    
    // Both should be roots (shared file has no parent in dataset)
    expect(dag.roots).toHaveLength(2);
    expect(dag.roots).toContain('my_root');
    expect(dag.roots).toContain('shared_orphan');
    
    // But ownership is correctly tracked
    expect(dag.nodesById.get('my_root')?.ownedByMe).toBe(true);
    expect(dag.nodesById.get('shared_orphan')?.ownedByMe).toBe(false);
  });

  it('should maintain ownership through multi-parent DAG', () => {
    // File with multiple parents (DAG, not tree)
    const files: FileItem[] = [
      createFolder({ id: 'folder_a', name: 'Folder A', ownedByMe: true }),
      createFolder({ id: 'folder_b', name: 'Folder B', ownedByMe: true }),
      createFile({ 
        id: 'multi_parent_file', 
        name: 'Shared Doc', 
        ownedByMe: false, 
        parents: ['folder_a', 'folder_b'] 
      }),
    ];
    
    const dag = buildDriveDag(files);
    
    const node = dag.nodesById.get('multi_parent_file');
    expect(node?.ownedByMe).toBe(false);
    expect(node?.parents).toEqual(['folder_a', 'folder_b']);
    
    // File appears in both parent's children
    expect(dag.childrenById.get('folder_a')).toContain('multi_parent_file');
    expect(dag.childrenById.get('folder_b')).toContain('multi_parent_file');
  });
});
