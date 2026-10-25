package com.vireon.ai

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/**
 * First native Vireon screen.
 *
 * This is deliberately introduced beside the existing WebView activity so the
 * native shell can be expanded and tested without deleting the current editor.
 */
class NativeHomeActivity : AppCompatActivity() {
    private val background = Color.rgb(13, 16, 25)
    private val panel = Color.rgb(25, 30, 44)
    private val accent = Color.rgb(126, 104, 255)
    private val secondaryText = Color.rgb(174, 182, 202)
    private var selectedMedia: Uri? = null
    private lateinit var selectedMediaLabel: TextView

    private val mediaPicker = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            selectedMedia = uri
            try {
                contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (_: SecurityException) {
                // Some document providers do not grant persistable access.
            }
            selectedMediaLabel.text = "تم اختيار ملف\n$uri"
            selectedMediaLabel.visibility = View.VISIBLE
            Toast.makeText(this, "تم اختيار الوسائط بنجاح", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = background
        window.navigationBarColor = background
        window.decorView.systemUiVisibility = 0
        buildHome()
    }

    private fun buildHome() {
        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(background)
            setPadding(dp(20), dp(20), dp(20), dp(20))
        }

        val scroll = ScrollView(this).apply {
            isFillViewport = true
            addView(page)
        }

        val brand = text("VIREON", 30f, Color.WHITE, true).apply {
            letterSpacing = 0.12f
        }
        page.addView(brand, matchWrap())
        page.addView(text("استوديو الإبداع", 15f, secondaryText), marginParams(bottom = 26))

        val hero = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
            setBackgroundColor(panel)
        }
        hero.addView(text("حوّل فكرتك إلى عمل إبداعي", 22f, Color.WHITE, true), marginParams(bottom = 8))
        hero.addView(
            text("واجهة أندرويد أصلية قيد البناء. سننقل الأدوات خطوة بخطوة مع الحفاظ على مشروعك الحالي.", 14f, secondaryText),
            marginParams(bottom = 18)
        )
        hero.addView(actionButton("استيراد صورة أو فيديو أو صوت", true) { pickMedia() })
        selectedMediaLabel = text("", 12f, secondaryText).apply {
            visibility = View.GONE
        }
        hero.addView(selectedMediaLabel, marginParams(top = 12))
        page.addView(hero, marginParams(bottom = 22))

        page.addView(text("مساحة العمل", 19f, Color.WHITE, true), marginParams(bottom = 12))
        page.addView(
            featureCard("مشاريعي", "ابدأ باستيراد ملفاتك محلياً أو تابع إلى مساحة التحرير الحالية.", "فتح مساحة التحرير") {
                openLegacyEditor()
            },
            marginParams(bottom = 12)
        )
        page.addView(
            featureCard("مكتبة الوسائط", "اختيار الصور والفيديوهات والملفات الصوتية من جهازك.", "اختيار ملفات") {
                pickMedia()
            },
            marginParams(bottom = 12)
        )
        page.addView(
            featureCard("المحرر والتصدير", "سيتم نقل المحرر ومعالجة الملفات والتصدير الأصلي على مراحل.", "فتح المحرر الحالي مؤقتاً") {
                openLegacyEditor()
            },
            marginParams(bottom = 12)
        )
        page.addView(
            featureCard("الذكاء الاصطناعي والصوتيات", "هذه الأدوات لم تُنقل بعد إلى النسخة الأصلية.", "عرض الحالة") {
                Toast.makeText(this, "قيد النقل إلى التطبيق الأصلي — لم نفعّل وظيفة وهمية", Toast.LENGTH_LONG).show()
            },
            marginParams(bottom = 22)
        )
        page.addView(
            text("نسخة انتقالية • لا تحذف النسخة الحالية ولا تغيّر بياناتك", 12f, secondaryText).apply {
                gravity = Gravity.CENTER
            },
            marginParams(top = 8, bottom = 12)
        )
        setContentView(scroll)
    }

    private fun featureCard(title: String, description: String, buttonLabel: String, onClick: () -> Unit): View {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            setBackgroundColor(panel)
        }
        card.addView(text(title, 18f, Color.WHITE, true), marginParams(bottom = 6))
        card.addView(text(description, 13f, secondaryText), marginParams(bottom = 14))
        card.addView(actionButton(buttonLabel, false, onClick))
        return card
    }

    private fun pickMedia() {
        mediaPicker.launch(arrayOf("image/*", "video/*", "audio/*"))
    }

    private fun openLegacyEditor() {
        // Keep the current editor available during migration; native home itself does not load a URL.
        startActivity(Intent(this, MainActivity::class.java))
    }

    private fun actionButton(label: String, primary: Boolean, onClick: () -> Unit): Button =
        Button(this).apply {
            text = label
            isAllCaps = false
            textSize = 14f
            setTextColor(Color.WHITE)
            setBackgroundTintList(android.content.res.ColorStateList.valueOf(if (primary) accent else Color.rgb(56, 64, 86)))
            setOnClickListener { onClick() }
        }

    private fun text(value: String, size: Float, color: Int, bold: Boolean = false) =
        TextView(this).apply {
            text = value
            textSize = size
            setTextColor(color)
            if (bold) setTypeface(typeface, Typeface.BOLD)
            setLineSpacing(dp(3).toFloat(), 1f)
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun matchWrap() = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    )

    private fun marginParams(
        top: Int = 0,
        bottom: Int = 0
    ) = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply {
        topMargin = dp(top)
        bottomMargin = dp(bottom)
    }
}
