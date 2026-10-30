//! A source scan of every test in the tree: no test names a literal port.

// K11: tests bind port 0 and read the real port back; a literal port is a
// collision waiting for a colleague. Allowed: :0 (kernel picks), :1 and :9
// (deliberately closed ports for connection-refused paths).
#[test]
fn no_test_names_a_literal_port() {
    fn walk(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
        for e in std::fs::read_dir(dir).unwrap().flatten() {
            let p = e.path();
            if p.is_dir() {
                if p.file_name().is_some_and(|n| n == "target" || n == ".git") {
                    continue;
                }
                walk(&p, out);
            } else if p.extension().is_some_and(|x| x == "rs") {
                out.push(p);
            }
        }
    }
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut files = Vec::new();
    for sub in ["crates", "examples"] {
        walk(&root.join(sub), &mut files);
    }
    assert!(files.len() > 20, "scan found {} files", files.len());
    let mut offenders = Vec::new();
    for f in files {
        let text = std::fs::read_to_string(&f).unwrap();
        for (i, line) in text.lines().enumerate() {
            // Doc comments and comments explain; they do not bind.
            if line.trim_start().starts_with("//") {
                continue;
            }
            let mut rest = line;
            while let Some(idx) = rest.find("127.0.0.1:") {
                let after = &rest[idx + "127.0.0.1:".len()..];
                let port: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
                if !matches!(port.as_str(), "" | "0" | "1" | "9") {
                    offenders.push(format!("{}:{}: {}", f.display(), i + 1, line.trim()));
                }
                rest = after;
            }
        }
    }
    assert!(
        offenders.is_empty(),
        "literal ports in tests:\n{}",
        offenders.join("\n")
    );
}
