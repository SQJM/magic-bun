// Pure stdlib NTFS-optimized file scanner for Magic build system.
// Walks directory and collects file paths, sizes, and modification times
// in a single pass, eliminating the need for separate stat calls.
//
// Usage:
//   usn-scan.exe <root_dir> [--exclude-dir dir1,dir2] [--exclude-file f1,f2]
//
// Output: JSON to stdout with {files: [{path, size, mtime}], duration_ms}
// On failure: non-zero exit code with error message on stderr

use std::fs;
use std::path::Path;
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

struct FileEntry {
    path: String,
    size: u64,
    mtime: f64,
}

fn to_millis(time: SystemTime) -> f64 {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs_f64()
        * 1000.0
}

/// Recursively walk a directory, collecting file entries.
/// Uses `read_dir` to get names and entry types, then stats each file.
fn walk_dir(
    dir: &Path,
    root_abs: &Path,
    exclude_dirs: &[String],
    exclude_files: &[String],
    results: &mut Vec<FileEntry>,
) -> Result<(), std::io::Error> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("Warning: cannot read directory '{}': {}", dir.display(), e);
            return Err(e);
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();

        if ft.is_dir() {
            // Check if this directory should be excluded
            let should_exclude = exclude_dirs.iter().any(|d| *d == name);
            if should_exclude {
                continue;
            }
            let _ = walk_dir(&entry.path(), root_abs, exclude_dirs, exclude_files, results);
        } else if ft.is_file() {
            if exclude_files.contains(&name) {
                continue;
            }

            let rel = entry
                .path()
                .strip_prefix(root_abs)
                .unwrap_or(&entry.path())
                .to_string_lossy()
                .replace('\\', "/");

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let size = metadata.len();
            let mtime = metadata
                .modified()
                .map(to_millis)
                .unwrap_or(0.0);

            results.push(FileEntry {
                path: rel,
                size,
                mtime,
            });
        }
    }

    Ok(())
}

/// Walk top-level subdirectories in parallel threads.
fn parallel_walk(
    root_abs: &Path,
    exclude_dirs: &[String],
    exclude_files: &[String],
) -> Vec<FileEntry> {
    let mut results = Vec::new();

    // First, collect top-level entries, separating dirs and files
    let read_dir = match fs::read_dir(root_abs) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Error: cannot read root directory: {}", e);
            return results;
        }
    };

    let mut top_dirs = Vec::new();
    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();

        if ft.is_dir() {
            let should_exclude = exclude_dirs.iter().any(|d| *d == name);
            if !should_exclude {
                top_dirs.push(entry.path());
            }
        } else if ft.is_file() {
            if exclude_files.contains(&name) {
                continue;
            }
            // Process top-level files directly
            let rel = entry
                .path()
                .strip_prefix(root_abs)
                .unwrap_or(&entry.path())
                .to_string_lossy()
                .replace('\\', "/");
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            results.push(FileEntry {
                path: rel,
                size: metadata.len(),
                mtime: metadata.modified().map(to_millis).unwrap_or(0.0),
            });
        }
    }

    let (tx, rx) = mpsc::channel::<Vec<FileEntry>>();
    let mut handles = Vec::new();

    for path in top_dirs {
        let tx = tx.clone();
        let root_abs = root_abs.to_path_buf();
        let exclude_dirs = exclude_dirs.to_vec();
        let exclude_files = exclude_files.to_vec();

        let handle = std::thread::spawn(move || {
            let mut local_results = Vec::new();
            let _ = walk_dir(&path, &root_abs, &exclude_dirs, &exclude_files, &mut local_results);
            let _ = tx.send(local_results);
        });

        handles.push(handle);
    }

    drop(tx);

    while let Ok(mut chunk) = rx.recv() {
        results.append(&mut chunk);
    }

    for handle in handles {
        let _ = handle.join();
    }

    results
}

/// Escape a string for JSON output (handles special characters).
fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c < ' ' => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn main() {
    let start = std::time::Instant::now();

    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: usn-scan.exe <root_dir> [--exclude-dir dir1,dir2,...] [--exclude-file file1,file2,...]");
        std::process::exit(1);
    }

    let root_dir = &args[1];

    // Parse exclude patterns
    let exclude_dirs: Vec<String> = args
        .windows(2)
        .find(|w| w[0] == "--exclude-dir")
        .map(|w| w[1].split(',').map(|s| s.to_string()).collect())
        .unwrap_or_default();

    let exclude_files: Vec<String> = args
        .windows(2)
        .find(|w| w[0] == "--exclude-file")
        .map(|w| w[1].split(',').map(|s| s.to_string()).collect())
        .unwrap_or_default();

    // Normalize root_dir
    let root_abs = std::fs::canonicalize(root_dir).unwrap_or_else(|e| {
        eprintln!("Error: cannot access root directory '{}': {}", root_dir, e);
        std::process::exit(1);
    });

    let files = parallel_walk(&root_abs, &exclude_dirs, &exclude_files);

    let duration = start.elapsed().as_secs_f64() * 1000.0;

    // Write JSON output manually (no serde dependency)
    let mut json = String::with_capacity(files.len() * 120);
    json.push_str("{\"duration_ms\":");
    json.push_str(&format!("{:.3}", duration));
    json.push_str(",\"files\":[");

    for (i, f) in files.iter().enumerate() {
        if i > 0 {
            json.push(',');
        }
        json.push_str("{\"path\":\"");
        json.push_str(&json_escape(&f.path));
        json.push_str("\",\"size\":");
        json.push_str(&f.size.to_string());
        json.push_str(",\"mtime\":");
        json.push_str(&format!("{:.3}", f.mtime));
        json.push('}');
    }

    json.push_str("]}\n");

    print!("{}", json);
}
