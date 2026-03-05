# IONOS /dfs/ 404 — Debug Steps

Do these in order. After each step, try the URL and note the result.

---

## Step 1: Rule out auth

1. In Webspace Explorer, open the **dfs** folder.
2. **Rename** `.htaccess` to `.htaccess.bak` (so Apache ignores it).
3. Open: **http://gamesmoviesmusic.com/dfs/ionos-test.html**
   - **If you see "OK"** → Auth was the problem. We'll fix .htaccess and re-enable auth safely.
   - **If still 404** → Go to Step 2.

---

## Step 2: Confirm document root

1. In Webspace Explorer, go to **Path: /** (the root, same level as the **dfs** folder).
2. **Upload** a file named **root-test.html** with this content:
   ```html
   <!DOCTYPE html><html><body><h1>Root OK</h1></body></html>
   ```
3. Open: **http://gamesmoviesmusic.com/root-test.html**
   - **If you see "Root OK"** → Document root is correct. The issue is specific to **/dfs/** (go to Step 3).
   - **If 404** → Try **http://www.gamesmoviesmusic.com/root-test.html**. If that works, use **www** for all URLs.
   - **If both 404** → The site may use a different document root or domain. Contact IONOS: *"What is the document root for gamesmoviesmusic.com, and what URL do I use to open a file I upload there?"*

---

## Step 3: Check /dfs/ folder

1. Confirm **dfs** folder permissions are **755** (not 705).
2. Confirm **ionos-test.html** is **inside** dfs (same level as .htaccess).
3. Open: **http://gamesmoviesmusic.com/dfs/ionos-test.html** (exact URL, no trailing slash).
   - **If 404** → Ask IONOS: *"I have a file at [absolute path from Path popup]/dfs/ionos-test.html. What exact URL should open it?"*

---

## Step 4: Restore auth (only if Step 1 showed "OK")

1. Rename `.htaccess.bak` back to `.htaccess`.
2. Or use the original .htaccess and ensure AuthUserFile path matches the absolute path IONOS shows for **dfs** (e.g. `/kunden/homepages/14/d4299584407/htdocs/dfs/.htpasswd`).

---

## What to report back

- Step 1: With .htaccess renamed, does **/dfs/ionos-test.html** load? (Yes / No)
- Step 2: Does **/root-test.html** (or **/www/...**) load? (Yes / No)
- Step 3: **dfs** permission and exact URL you used for ionos-test.html.

That will pinpoint the fix.
