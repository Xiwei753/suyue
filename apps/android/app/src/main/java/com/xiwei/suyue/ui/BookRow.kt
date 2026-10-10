// SPDX-License-Identifier: GPL-3.0-only
// 书架单行渲染：标题、元信息、状态、发送/删除。
package com.xiwei.suyue.ui

import android.graphics.Color
import com.xiwei.suyue.databinding.ItemBookBinding
import com.xiwei.suyue.model.BookMeta
import com.xiwei.suyue.model.BookStatus

object BookRow {

    fun bind(
        binding: ItemBookBinding,
        book: BookMeta,
        canSend: Boolean,
        onSend: () -> Unit,
        onDelete: () -> Unit
    ) {
        binding.bookTitle.text = book.title
        binding.bookMeta.text =
            "${book.kind.value.uppercase()} · ${book.bytes} 字节 · ${book.chapters.size} 章"
        binding.bookStatus.text = book.status.value
        val ready = book.status == BookStatus.READY
        binding.bookStatus.setTextColor(
            if (ready) Color.parseColor("#4ADE80") else Color.parseColor("#F87171")
        )
        binding.btnSend.isEnabled = canSend && ready
        binding.btnSend.setOnClickListener { onSend() }
        binding.btnDelete.setOnClickListener { onDelete() }
    }
}
