import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs')
vi.mock('../../domain/parser.js')
vi.mock('../../infrastructure/data.js')

import {
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from 'fs'
import { validateRawContent } from '../../domain/parser.js'
import { rawDir } from '../../infrastructure/data.js'
import { listRawFiles, saveRawFile, deleteRawFile } from '../../application/fileService.js'

const mockExists = vi.mocked(existsSync)
const mockReaddir = vi.mocked(readdirSync)
const mockStat = vi.mocked(statSync)
const mockMkdir = vi.mocked(mkdirSync)
const mockWriteFile = vi.mocked(writeFileSync)
const mockUnlink = vi.mocked(unlinkSync)
const mockValidate = vi.mocked(validateRawContent)
const mockRawDir = vi.mocked(rawDir)

beforeEach(() => {
  vi.resetAllMocks()
  mockRawDir.mockReturnValue('/data/input_data')
  mockValidate.mockReturnValue({ ok: true, error: '' })
})

// ---------------------------------------------------------------------------
// listRawFiles
// ---------------------------------------------------------------------------

describe('listRawFiles', () => {
  it('returns empty array when directory does not exist', () => {
    mockExists.mockReturnValue(false)
    expect(listRawFiles()).toEqual([])
  })

  it('returns metadata for .txt files sorted alphabetically', () => {
    mockExists.mockReturnValue(true)
    mockReaddir.mockReturnValue(['b.txt', 'a.txt'] as unknown as ReturnType<typeof readdirSync>)
    mockStat.mockReturnValue({ size: 100, mtimeMs: 1700000000000 } as unknown as ReturnType<typeof statSync>)
    const result = listRawFiles() as Array<Record<string, unknown>>
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('a.txt')
    expect(result[0].size).toBe(100)
    expect(result[0].modified).toBe(1700000000)
  })

  it('skips non-.txt files', () => {
    mockExists.mockReturnValue(true)
    mockReaddir.mockReturnValue(['data.csv', 'notes.json'] as unknown as ReturnType<typeof readdirSync>)
    expect(listRawFiles()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// saveRawFile
// ---------------------------------------------------------------------------

describe('saveRawFile', () => {
  it('returns error when filename sanitizes to empty string', () => {
    // A name that after sanitization becomes empty:
    // leading dots/underscores are stripped, and if the result is empty it fails
    const result = saveRawFile('...', 'content')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('No filename.')
  })

  it('returns error for non-.txt extension', () => {
    const result = saveRawFile('data.csv', 'content')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Only .txt files are accepted.')
  })

  it('returns error when content validation fails', () => {
    mockValidate.mockReturnValue({ ok: false, error: 'No valid events.' })
    const result = saveRawFile('data.txt', 'bad content')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('No valid events.')
  })

  it('writes the file on success', () => {
    const result = saveRawFile('data.txt', '1\tAlice\tAdmin\t2024-01-15 09:00:00')
    expect(result.ok).toBe(true)
    expect(mockMkdir).toHaveBeenCalledWith('/data/input_data', { recursive: true })
    expect(mockWriteFile).toHaveBeenCalledWith('/data/input_data/data.txt', '1\tAlice\tAdmin\t2024-01-15 09:00:00', 'utf-8')
  })

  it('sanitizes path separators (uses only the final path component)', () => {
    saveRawFile('path/to/file.txt', 'content')
    expect(mockWriteFile).toHaveBeenCalledWith('/data/input_data/file.txt', 'content', 'utf-8')
  })

  it('sanitizes Windows-style path separators', () => {
    saveRawFile('path\\to\\file.txt', 'content')
    expect(mockWriteFile).toHaveBeenCalledWith('/data/input_data/file.txt', 'content', 'utf-8')
  })

  it('strips leading dots from filename', () => {
    saveRawFile('.hidden.txt', 'content')
    expect(mockWriteFile).toHaveBeenCalledWith('/data/input_data/hidden.txt', 'content', 'utf-8')
  })

  it('replaces special characters with underscores', () => {
    saveRawFile('my file!@#.txt', 'content')
    const call = mockWriteFile.mock.calls[0]
    expect(call[0]).toContain('my_file___')
  })
})

// ---------------------------------------------------------------------------
// deleteRawFile
// ---------------------------------------------------------------------------

describe('deleteRawFile', () => {
  it('returns error for non-.txt filename after sanitization', () => {
    const result = deleteRawFile('data.csv')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Invalid file.')
  })

  it('returns error when file does not exist', () => {
    mockExists.mockReturnValue(false)
    const result = deleteRawFile('data.txt')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('File not found.')
  })

  it('deletes the file and returns ok=true on success', () => {
    mockExists.mockReturnValue(true)
    const result = deleteRawFile('data.txt')
    expect(result.ok).toBe(true)
    expect(mockUnlink).toHaveBeenCalledWith('/data/input_data/data.txt')
  })
})
