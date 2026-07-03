const MAX_INPUT: usize = 262144;
const MAX_ERRORS: usize = 512;

var input_buf: [MAX_INPUT]u8 = undefined;
var err_codes: [MAX_ERRORS]u32 = undefined;
var err_lines: [MAX_ERRORS]u32 = undefined;
var err_count: u32 = 0;

const tags = [_][]const u8{
    "div", "section", "nav", "header", "footer", "main",
    "h1", "h2", "h3", "p", "a", "ul", "li", "span", "form", "style", "title", "body", "html", "head",
};

export fn getInputPtr() [*]u8 {
    return &input_buf;
}

export fn getMaxInput() u32 {
    return MAX_INPUT;
}

export fn getErrorCode(i: u32) u32 {
    if (i >= err_count) return 0;
    return err_codes[i];
}

export fn getErrorLine(i: u32) u32 {
    if (i >= err_count) return 0;
    return err_lines[i];
}

fn addError(code: u32, line: u32) void {
    if (err_count >= MAX_ERRORS) return;
    err_codes[err_count] = code;
    err_lines[err_count] = line;
    err_count += 1;
}

fn isBoundary(c: u8) bool {
    return c == ' ' or c == '>' or c == '/' or c == '\t' or c == '\n' or c == '\r';
}

fn lowerByte(c: u8) u8 {
    return if (c >= 'A' and c <= 'Z') c + 32 else c;
}

fn matchesTag(text: []const u8, pos: usize, tag: []const u8) bool {
    if (pos + tag.len > text.len) return false;
    var i: usize = 0;
    while (i < tag.len) : (i += 1) {
        if (lowerByte(text[pos + i]) != tag[i]) return false;
    }
    if (pos + tag.len >= text.len) return true;
    return isBoundary(text[pos + tag.len]);
}

fn startsWith(text: []const u8, pos: usize, needle: []const u8) bool {
    if (pos + needle.len > text.len) return false;
    var i: usize = 0;
    while (i < needle.len) : (i += 1) {
        if (lowerByte(text[pos + i]) != needle[i]) return false;
    }
    return true;
}

export fn validate(len: u32) u32 {
    err_count = 0;
    const n: usize = if (len > MAX_INPUT) MAX_INPUT else len;
    const text: []const u8 = input_buf[0..n];

    var opens: [tags.len]i32 = @splat(0);
    var closes: [tags.len]i32 = @splat(0);

    var line: u32 = 1;
    var i: usize = 0;
    var in_comment: bool = false;
    var comment_start_line: u32 = 0;

    while (i < n) : (i += 1) {
        const c = text[i];
        if (c == '\n') {
            line += 1;
            continue;
        }

        if (!in_comment and startsWith(text, i, "<!--")) {
            in_comment = true;
            comment_start_line = line;
            i += 3;
            continue;
        }
        if (in_comment) {
            if (startsWith(text, i, "-->")) {
                in_comment = false;
                i += 2;
            }
            continue;
        }

        if (c == '!' and i + 1 < n and text[i + 1] == '[') {
            var j: usize = i + 2;
            const limit = if (i + 200 < n) i + 200 else n;
            while (j + 1 < limit and text[j] != '\n') : (j += 1) {
                if (text[j] == ']' and text[j + 1] == '(') {
                    addError(5, line);
                    break;
                }
            }
        }

        if (c != '<') continue;

        if (startsWith(text, i, "<script")) {
            var j: usize = i;
            var is_ldjson = false;
            while (j < n and text[j] != '>') : (j += 1) {
                if (startsWith(text, j, "ld+json")) {
                    is_ldjson = true;
                    break;
                }
            }
            if (!is_ldjson) addError(7, line);
        }

        if (startsWith(text, i, "<img")) {
            var j: usize = i + 4;
            var has_alt = false;
            while (j < n and text[j] != '>') : (j += 1) {
                if (startsWith(text, j, " alt=") or startsWith(text, j, "\talt=")) {
                    has_alt = true;
                }
            }
            if (!has_alt) addError(3, line);
        }

        if (startsWith(text, i, "<a")) {
            var j: usize = i;
            while (j < n and text[j] != '>') : (j += 1) {
                if (startsWith(text, j, "href=\"\"")) {
                    addError(6, line);
                    break;
                }
            }
        }

        if (i + 1 < n and text[i + 1] == '/') {
            for (tags, 0..) |tag, ti| {
                if (matchesTag(text, i + 2, tag)) {
                    closes[ti] += 1;
                    break;
                }
            }
        } else {
            for (tags, 0..) |tag, ti| {
                if (matchesTag(text, i + 1, tag)) {
                    opens[ti] += 1;
                    break;
                }
            }
        }
    }

    var k: usize = 0;
    var http_line: u32 = 1;
    while (k + 7 <= n) : (k += 1) {
        if (text[k] == '\n') http_line += 1;
        if (startsWith(text, k, "http://")) {
            addError(4, http_line);
            k += 6;
        }
    }

    if (in_comment) addError(8, comment_start_line);

    for (tags, 0..) |_, ti| {
        const idx: u32 = @intCast(ti);
        if (opens[ti] > closes[ti]) addError(100 + idx, 0);
        if (closes[ti] > opens[ti]) addError(200 + idx, 0);
    }

    return err_count;
}

// ============================================================
// SuperMD (.smd) VALIDATOR — Ziggy front-matter + Scripty pravila
// 20=YAML dvotačka  21=string bez navodnika  22=datum neispravan
// 23=front-matter nije ograničen sa ---  24=$image/$video bez .asset('/.url('
// ============================================================

fn isDigit(c: u8) bool {
    return c >= '0' and c <= '9';
}

fn sliceEql(a: []const u8, b: []const u8) bool {
    if (a.len != b.len) return false;
    var i: usize = 0;
    while (i < a.len) : (i += 1) {
        if (a[i] != b[i]) return false;
    }
    return true;
}

fn trimS(s: []const u8) []const u8 {
    var a: usize = 0;
    var b: usize = s.len;
    while (a < b and (s[a] == ' ' or s[a] == '\t' or s[a] == '\r')) a += 1;
    while (b > a and (s[b - 1] == ' ' or s[b - 1] == '\t' or s[b - 1] == '\r')) b -= 1;
    return s[a..b];
}

fn isDateToken(s: []const u8) bool {
    if (s.len != 10) return false;
    for (s, 0..) |c, i| {
        if (i == 4 or i == 7) {
            if (c != '-') return false;
        } else if (!isDigit(c)) return false;
    }
    return true;
}

fn isNumberToken(s: []const u8) bool {
    if (s.len == 0) return false;
    var dots: u32 = 0;
    for (s) |c| {
        if (c == '.') {
            dots += 1;
            if (dots > 1) return false;
        } else if (!isDigit(c) and c != '-') return false;
    }
    return true;
}

export fn validateSmd(len: u32) u32 {
    err_count = 0;
    const n: usize = if (len > MAX_INPUT) MAX_INPUT else len;
    const text: []const u8 = input_buf[0..n];

    var line_no: u32 = 0;
    var i: usize = 0;
    var fm_delims: u32 = 0;

    while (i <= n) {
        var j = i;
        while (j < n and text[j] != '\n') j += 1;
        const line = trimS(text[i..j]);
        line_no += 1;

        if (sliceEql(line, "---")) {
            if (fm_delims < 2) fm_delims += 1;
        } else if (fm_delims == 1 and line.len > 0) {
            var eq_pos: usize = line.len;
            var colon_pos: usize = line.len;
            var k: usize = 0;
            while (k < line.len) : (k += 1) {
                if (line[k] == '=' and eq_pos == line.len) eq_pos = k;
                if (line[k] == ':' and colon_pos == line.len) colon_pos = k;
            }
            if (colon_pos < eq_pos) {
                addError(20, line_no);
            } else if (eq_pos < line.len) {
                const key = trimS(line[0..eq_pos]);
                const val = trimS(line[eq_pos + 1 ..]);
                if (sliceEql(key, "date")) {
                    if (!isDateToken(val)) addError(22, line_no);
                } else if (sliceEql(val, "true") or sliceEql(val, "false")) {
                    // ok — logička vrednost
                } else if (isNumberToken(val) or isDateToken(val)) {
                    // ok — broj/datum
                } else if (val.len >= 2 and val[0] == '"' and val[val.len - 1] == '"') {
                    // ok — string pod navodnicima
                } else {
                    addError(21, line_no);
                }
            }
        } else if (fm_delims != 1) {
            var k: usize = 0;
            while (k < line.len) : (k += 1) {
                if (line[k] == '!' and k + 1 < line.len and line[k + 1] == '[') {
                    var m = k + 2;
                    while (m + 1 < line.len) : (m += 1) {
                        if (line[m] == ']' and line[m + 1] == '(') {
                            addError(5, line_no);
                            break;
                        }
                    }
                }
                if (line[k] == '$') {
                    var tag_len: usize = 0;
                    if (startsWith(line, k, "$image")) tag_len = 6;
                    if (startsWith(line, k, "$video")) tag_len = 6;
                    if (tag_len > 0) {
                        const rest = k + tag_len;
                        const okDir = startsWith(line, rest, ".asset('") or startsWith(line, rest, ".url('");
                        if (!okDir) addError(24, line_no);
                    }
                }
                if (startsWith(line, k, "http://")) addError(4, line_no);
            }
        }

        if (j >= n) break;
        i = j + 1;
    }

    if (fm_delims < 2) addError(23, 0);
    return err_count;
}
