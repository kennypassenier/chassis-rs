//! Tests of the sqlite handle: pragmas, migrations, inspection and the
//! file-level maintenance, over real files in a temp dir.

use super::*;

mod maintenance;
mod migrations;
mod pool;

pub(super) fn two() -> Vec<Migration> {
    vec![
        Migration::sql("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL) STRICT;"),
        Migration::sql("CREATE TABLE u (id INTEGER PRIMARY KEY) STRICT;"),
    ]
}
