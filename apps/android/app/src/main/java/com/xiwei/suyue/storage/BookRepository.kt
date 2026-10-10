// SPDX-License-Identifier: GPL-3.0-only
// 手机侧书库索引：library.json + books/<bookId>.txt（Android 沙箱私有目录）。
// 只有文件真实存在且登记成功的书才对 UI 可见。
package com.xiwei.suyue.storage

import android.content.Context
import com.xiwei.suyue.model.BookMeta
import com.xiwei.suyue.model.BookStatus
import org.json.JSONArray
import java.io.File

class BookRepository(context: Context) {

    private val filesDir: File = context.filesDir
    private val libraryFile: File = File(filesDir, LIBRARY_FILE)
    val booksDir: File = File(filesDir, "books")

    private fun readIndex(): MutableList<BookMeta> {
        val text = try {
            if (!libraryFile.exists()) return mutableListOf()
            libraryFile.readText(Charsets.UTF_8)
        } catch (e: Exception) {
            return mutableListOf()
        }
        return try {
            val arr = JSONArray(text)
            val out = mutableListOf<BookMeta>()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                BookMeta.fromJson(o)?.let { out.add(it) }
            }
            out
        } catch (e: Exception) {
            mutableListOf()
        }
    }

    private fun writeIndex(books: List<BookMeta>) {
        val arr = JSONArray()
        books.forEach { arr.put(it.toJson()) }
        // 先写临时文件再原子替换，避免写入中途崩溃损坏索引。
        val tmp = File(filesDir, "$LIBRARY_FILE.tmp")
        tmp.writeText(arr.toString(), Charsets.UTF_8)
        if (libraryFile.exists()) libraryFile.delete()
        tmp.renameTo(libraryFile)
    }

    // 只列出正文文件真实存在的书。
    fun list(): List<BookMeta> =
        readIndex().filter { fileExists(it.filePath) }

    fun get(bookId: String): BookMeta? =
        readIndex().firstOrNull { it.bookId == bookId && fileExists(it.filePath) }

    // 重复导入（同 bookId）且摘要一致时幂等返回；
    // 摘要不同视为新版本并覆盖，同时更新时间戳。
    fun register(meta: BookMeta) {
        val books = readIndex()
        val idx = books.indexOfFirst { it.bookId == meta.bookId }
        if (idx >= 0 && books[idx].sha256 == meta.sha256) {
            books[idx] = books[idx].copy(updatedAt = meta.updatedAt)
            writeIndex(books)
            return
        }
        if (idx >= 0) books[idx] = meta else books.add(meta)
        writeIndex(books)
    }

    fun remove(bookId: String): Boolean {
        val books = readIndex()
        val idx = books.indexOfFirst { it.bookId == bookId }
        if (idx < 0) return false
        val target = books[idx]
        try {
            File(target.filePath).delete()
        } catch (e: Exception) {
            // 文件可能已不存在；索引清理仍然继续。
        }
        books.removeAt(idx)
        writeIndex(books)
        return true
    }

    fun markStatus(bookId: String, status: BookStatus, lastError: String? = null) {
        val books = readIndex()
        val idx = books.indexOfFirst { it.bookId == bookId }
        if (idx < 0) return
        books[idx] = books[idx].copy(
            status = status,
            lastError = lastError ?: books[idx].lastError
        )
        writeIndex(books)
    }

    private fun fileExists(path: String): Boolean {
        if (path.isEmpty()) return false
        return try {
            val f = File(path)
            f.exists() && f.length() > 0
        } catch (e: Exception) {
            false
        }
    }

    companion object {
        const val LIBRARY_FILE = "library.json"
    }
}
