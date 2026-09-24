# frozen_string_literal: true

# Measures the model's judgement against data already in the database.
# No Gemini calls, no labelling effort — everything here is derived from
# portfolio_skills, assessor_overrides, coverage_maps and transcript_turns.
#
#   bundle exec rails eval:report
#   EVAL_FORMAT=json bundle exec rails eval:report > eval.json
#
namespace :eval do
  desc 'Laporan mutu penilaian AI dari data yang sudah ada'
  task report: :environment do
    data = Eval::Collector.new.call

    if data[:skills].empty?
      warn "\nBelum ada portfolio_skills di database. Jalankan wawancara, " \
           "atau `rails demo:seed` untuk data contoh.\n\n"
      next
    end

    report = {
      generated_at: Time.current.iso8601,
      totals:       Eval::Report.totals(data),
      grounding:    Eval::Report.grounding(data),
      calibration:  Eval::Report.calibration(data),
      evidence:     Eval::Report.evidence_sufficiency(data),
      overrides:    Eval::Report.overrides(data),
      verbosity:    Eval::Report.verbosity(data)
    }

    if ENV['EVAL_FORMAT'] == 'json'
      puts JSON.pretty_generate(report)
    else
      Eval::Printer.new(report).call
    end
  end

  desc 'Daftar kutipan bukti yang tidak ditemukan di transkrip'
  task ungrounded: :environment do
    data = Eval::Collector.new.call
    rows = data[:quotes].reject { |q| q[:verbatim] || q[:loose] }

    if rows.empty?
      puts "\nSemua kutipan bukti ditemukan di transkrip.\n\n"
      next
    end

    puts "\n#{rows.size} kutipan tidak ditemukan di transkrip:\n\n"
    rows.each do |q|
      puts "  portfolio=#{q[:portfolio_id]}  #{q[:skill_label]}"
      puts "    #{q[:quote]}"
      puts
    end
  end
end

module Eval
  Quote = Struct.new(:portfolio_id, :skill_label, :quote, :verbatim, :loose, :cited_turn_ok, keyword_init: true)

  class Collector
    def call
      skills = PortfolioSkill.includes(:assessor_override, portfolio: :session).to_a
      sessions = skills.filter_map { |s| s.portfolio&.session }.uniq

      turns_by_session = TranscriptTurn.where(session_id: sessions.map(&:id))
                                       .group_by(&:session_id)
      coverage = CoverageMap.where(session_id: sessions.map(&:id))
                            .each_with_object({}) { |c, h| h[[c.session_id, c.skill_label]] = c }

      quotes = []
      skills.each do |skill|
        session = skill.portfolio&.session
        turns = turns_by_session[session&.id] || []
        skill.evidence_quotes.each_with_index do |quote, i|
          quotes << check_quote(skill, quote, turns, skill.evidence_turn_id_list[i])
        end
      end

      { skills: skills, turns_by_session: turns_by_session, coverage: coverage, quotes: quotes }
    end

    private

    def check_quote(skill, quote, turns, cited_turn_id)
      needle = normalize(quote)
      candidate_turns = turns.select { |t| t.speaker == 'candidate' }

      verbatim = candidate_turns.any? { |t| normalize(t.text).include?(needle) }
      loose    = verbatim || candidate_turns.any? { |t| word_overlap(needle, normalize(t.text)) >= 0.85 }

      cited = cited_turn_id && turns.find { |t| t.id == cited_turn_id }
      cited_ok = cited ? normalize(cited.text).include?(needle) : nil

      Quote.new(
        portfolio_id: skill.portfolio_id,
        skill_label:  skill.skill_label,
        quote:        quote.to_s,
        verbatim:     verbatim,
        loose:        loose,
        cited_turn_ok: cited_ok
      ).to_h
    end

    def normalize(text)
      text.to_s.gsub(/\s+/, ' ').strip.downcase
    end

    # Berapa bagian kata kutipan yang muncul di sebuah giliran.
    def word_overlap(needle, haystack)
      words = needle.split(' ').reject { |w| w.length < 3 }
      return 0.0 if words.empty?

      hay = haystack.split(' ').to_set
      words.count { |w| hay.include?(w) }.to_f / words.size
    end
  end

  module Report
    module_function

    def totals(data)
      skills = data[:skills]
      {
        portfolios: skills.map(&:portfolio_id).uniq.size,
        skills:     skills.size,
        overridden: skills.count { |s| s.assessor_override.present? },
        quotes:     data[:quotes].size
      }
    end

    def grounding(data)
      quotes = data[:quotes]
      return { quotes: 0 } if quotes.empty?

      cited = quotes.reject { |q| q[:cited_turn_ok].nil? }
      {
        quotes:        quotes.size,
        verbatim:      quotes.count { |q| q[:verbatim] },
        loose_only:    quotes.count { |q| !q[:verbatim] && q[:loose] },
        not_found:     quotes.count { |q| !q[:loose] },
        cited_checked: cited.size,
        cited_wrong:   cited.count { |q| q[:cited_turn_ok] == false },
        skills_without_evidence: data[:skills].count { |s| s.evidence_quotes.empty? }
      }
    end

    def calibration(data)
      buckets = { 'high' => [], 'medium' => [], 'low' => [], 'tidak diisi' => [] }

      data[:skills].each do |skill|
        key = skill.ai_confidence.presence || 'tidak diisi'
        buckets[key] << skill
      end

      buckets.transform_values do |skills|
        overridden = skills.select { |s| s.assessor_override.present? }
        deltas = overridden.map { |s| s.assessor_override.override_level - s.assessor_override.ai_level }
        {
          n:             skills.size,
          overridden:    overridden.size,
          override_rate: rate(overridden.size, skills.size),
          mean_abs_delta: mean(deltas.map(&:abs))
        }
      end
    end

    def evidence_sufficiency(data)
      rows = Hash.new { |h, k| h[k] = Hash.new(0) }

      data[:skills].each do |skill|
        session_id = skill.portfolio&.session&.id
        probe = data[:coverage][[session_id, skill.skill_label]]&.probe_count
        bucket =
          if probe.nil? then 'tidak tercatat'
          elsif probe.zero? then '0 probe'
          elsif probe == 1 then '1 probe'
          elsif probe <= 3 then '2-3 probe'
          else '4+ probe'
          end

        rows[bucket][skill.ai_confidence.presence || 'tidak diisi'] += 1
        rows[bucket]['total'] += 1
      end

      rows
    end

    def overrides(data)
      overridden = data[:skills].select { |s| s.assessor_override.present? }
      deltas = overridden.map { |s| s.assessor_override.override_level - s.assessor_override.ai_level }

      per_skill = data[:skills].group_by(&:skill_label).filter_map do |label, skills|
        rows = skills.select { |s| s.assessor_override.present? }
        next if rows.empty?

        d = rows.map { |s| s.assessor_override.override_level - s.assessor_override.ai_level }
        {
          skill_label:    label,
          n:              skills.size,
          overridden:     rows.size,
          override_rate:  rate(rows.size, skills.size),
          bias:           mean(d),
          mean_abs_delta: mean(d.map(&:abs))
        }
      end

      {
        n:              overridden.size,
        of_skills:      data[:skills].size,
        override_rate:  rate(overridden.size, data[:skills].size),
        bias:           mean(deltas),
        mean_abs_delta: mean(deltas.map(&:abs)),
        delta_histogram: deltas.tally.sort.to_h,
        per_skill:      per_skill.sort_by { |r| -r[:bias].to_f.abs }
      }
    end

    # Proksi kasar untuk bias kefasihan: apakah jawaban yang lebih panjang
    # cenderung mendapat level lebih tinggi.
    def verbosity(data)
      pairs = data[:skills].filter_map do |skill|
        session_id = skill.portfolio&.session&.id
        turns = data[:turns_by_session][session_id] || []
        cited = turns.select { |t| skill.evidence_turn_id_list.include?(t.id) }
        next if cited.empty?

        [cited.sum { |t| t.text.to_s.length }, skill.ai_level]
      end

      { n: pairs.size, correlation: pearson(pairs.map(&:first), pairs.map(&:last)) }
    end

    def rate(part, total)
      return nil if total.to_i.zero?

      (part.to_f / total * 100).round(1)
    end

    def mean(values)
      return nil if values.empty?

      (values.sum.to_f / values.size).round(2)
    end

    def pearson(xs, ys)
      n = xs.size
      return nil if n < 5

      mx = xs.sum.to_f / n
      my = ys.sum.to_f / n
      cov = xs.zip(ys).sum { |x, y| (x - mx) * (y - my) }
      sx = Math.sqrt(xs.sum { |x| (x - mx)**2 })
      sy = Math.sqrt(ys.sum { |y| (y - my)**2 })
      return nil if sx.zero? || sy.zero?

      (cov / (sx * sy)).round(2)
    end
  end

  class Printer
    BAR_WIDTH = 28
    PASS = "\e[32m✓\e[0m"
    WARN = "\e[33m!\e[0m"
    FAIL = "\e[31m✗\e[0m"

    def initialize(report)
      @r = report
    end

    def call
      header
      grounding
      calibration
      evidence
      overrides
      verbosity
      footer
    end

    private

    def mark(state) = { pass: PASS, warn: WARN, fail: FAIL }.fetch(state)

    def line(state, label, detail)
      puts format('  %s %-38s %s', mark(state), label, detail)
    end

    def section(title, subtitle = nil)
      puts "\n\e[1m#{title}\e[0m"
      puts "  \e[2m#{subtitle}\e[0m" if subtitle
      puts
    end

    def pct(value) = value.nil? ? '—' : "#{value}%"

    def header
      t = @r[:totals]
      puts "\n\e[1mEvaluasi penilaian AI\e[0m  ·  #{@r[:generated_at]}"
      puts "  #{t[:portfolios]} portfolio · #{t[:skills]} skill dinilai · " \
           "#{t[:overridden]} dikoreksi assessor · #{t[:quotes]} kutipan bukti"
    end

    def grounding
      g = @r[:grounding]
      section('1. Bukti yang dikutip benar-benar ada?',
              'Kutipan yang tidak ada di transkrip bukan penilaian yang kurang akurat — itu karangan.')

      if g[:quotes].to_i.zero?
        line(:warn, 'Kutipan bukti', 'tidak ada satu pun kutipan tersimpan')
        return
      end

      not_found = g[:not_found]
      line(not_found.zero? ? :pass : :fail, 'Kutipan tidak ditemukan',
           "#{not_found} dari #{g[:quotes]} (#{pct(Report.rate(not_found, g[:quotes]))})")
      line(:pass, 'Sama persis dengan transkrip',
           "#{g[:verbatim]} (#{pct(Report.rate(g[:verbatim], g[:quotes]))})")
      line(g[:loose_only].zero? ? :pass : :warn, 'Mirip tapi tidak persis',
           "#{g[:loose_only]} — parafrase, bukan kutipan")
      if g[:cited_checked].to_i.positive?
        line(g[:cited_wrong].zero? ? :pass : :fail, 'Turn yang ditunjuk salah',
             "#{g[:cited_wrong]} dari #{g[:cited_checked]} kutipan bernomor turn")
      end
      line(g[:skills_without_evidence].zero? ? :pass : :warn, 'Skill tanpa bukti sama sekali',
           g[:skills_without_evidence].to_s)
      puts "\n  \e[2mDaftar lengkapnya: bundle exec rails eval:ungrounded\e[0m"
    end

    def calibration
      section('2. Keyakinan terkalibrasi?',
              'Kalau "high" dikoreksi sesering "low", kolom keyakinan bukan informasi — ia hiasan.')

      puts format('  %-14s %6s %12s %14s %16s', 'Keyakinan', 'n', 'dikoreksi', 'rate', 'rata-rata |Δ|')
      puts "  #{'-' * 66}"

      @r[:calibration].each do |label, row|
        next if row[:n].zero?

        puts format('  %-14s %6d %12d %13s %16s',
                    label, row[:n], row[:overridden], pct(row[:override_rate]),
                    row[:mean_abs_delta] || '—')
      end

      high = @r[:calibration]['high']
      low  = @r[:calibration]['low']
      return unless high && low && high[:n].positive? && low[:n].positive?

      puts
      if high[:override_rate].to_f >= low[:override_rate].to_f
        line(:fail, 'Urutan kalibrasi', '"high" dikoreksi >= "low" — keyakinan tidak bermakna')
      else
        line(:pass, 'Urutan kalibrasi', '"high" dikoreksi lebih jarang daripada "low"')
      end
    end

    def evidence
      section('3. Level ditopang berapa probe?',
              'Level yang diberi keyakinan tinggi dari satu probe adalah tebakan yang terdengar yakin.')

      keys = %w[high medium low tidak\ diisi]
      puts format('  %-16s %8s %8s %8s %12s %8s', 'Probe', *keys, 'total')
      puts "  #{'-' * 66}"

      ['0 probe', '1 probe', '2-3 probe', '4+ probe', 'tidak tercatat'].each do |bucket|
        row = @r[:evidence][bucket]
        next if row.nil? || row['total'].to_i.zero?

        puts format('  %-16s %8d %8d %8d %12d %8d',
                    bucket, row['high'], row['medium'], row['low'], row['tidak diisi'], row['total'])
      end

      thin = ['0 probe', '1 probe'].sum { |b| @r[:evidence][b]&.dig('high').to_i }
      puts
      line(thin.zero? ? :pass : :fail, 'Keyakinan "high" dari <= 1 probe', thin.to_s)
    end

    def overrides
      o = @r[:overrides]
      section('4. Seberapa jauh AI meleset, dan ke arah mana?',
              'Bias berarah bisa diperbaiki lewat prompt. Sebaran acak tidak.')

      if o[:n].zero?
        line(:warn, 'Override', "0 dari #{o[:of_skills]} skill")
        puts "\n  \e[2mRate 0% bukan kabar baik. Kemungkinan besar assessor main stempel,\e[0m"
        puts "  \e[2mbukan AI-nya sempurna. Otomasi yang tidak pernah dikoreksi adalah\e[0m"
        puts "  \e[2motomasi yang sudah berhenti diawasi.\e[0m"
        return
      end

      line(:pass, 'Override rate', "#{o[:n]} dari #{o[:of_skills]} (#{pct(o[:override_rate])})")
      direction = o[:bias].to_f.positive? ? 'AI menilai terlalu rendah' : 'AI menilai terlalu tinggi'
      line(o[:bias].to_f.abs < 0.3 ? :pass : :warn, 'Bias berarah',
           "#{o[:bias]} tingkat — #{o[:bias].to_f.abs < 0.3 ? 'tidak ada arah yang jelas' : direction}")
      line(o[:mean_abs_delta].to_f <= 1.0 ? :pass : :fail, 'Rata-rata selisih',
           "#{o[:mean_abs_delta]} tingkat")

      puts "\n  Sebaran selisih (koreksi - AI):"
      o[:delta_histogram].each do |delta, count|
        bar = '#' * [(count.to_f / o[:n] * BAR_WIDTH).round, 1].max
        puts format('    %+3d  %-28s %d', delta, bar, count)
      end

      rows = o[:per_skill].reject { |r| r[:overridden].to_i.zero? }
      return if rows.empty?

      puts "\n  Per skill (diurutkan dari bias terbesar):"
      puts format('    %-38s %5s %6s %8s %8s', 'Skill', 'n', 'koreksi', 'bias', '|Δ|')
      rows.first(10).each do |r|
        puts format('    %-38s %5d %6d %8s %8s',
                    r[:skill_label].to_s[0, 38], r[:n], r[:overridden], r[:bias], r[:mean_abs_delta])
      end
    end

    def verbosity
      v = @r[:verbosity]
      section('5. Apakah yang diukur kompetensi atau kefasihan?',
              'Korelasi panjang jawaban dengan level. Proksi kasar, tapi temuan kuatnya jelas.')

      if v[:correlation].nil?
        line(:warn, 'Korelasi panjang jawaban vs level', "sampel belum cukup (n=#{v[:n]}, minimal 5)")
        return
      end

      state = v[:correlation].abs >= 0.5 ? :fail : (v[:correlation].abs >= 0.3 ? :warn : :pass)
      line(state, 'Korelasi panjang jawaban vs level', "r = #{v[:correlation]} (n=#{v[:n]})")
      puts "\n  \e[2mr di atas 0.5 berarti jawaban panjang cenderung dapat level tinggi.\e[0m"
      puts "  \e[2mItu mengukur siapa yang banyak bicara, bukan siapa yang kompeten.\e[0m"
    end

    def footer
      puts "\n  \e[2mSemua angka di atas berasal dari data yang sudah ada — tidak ada panggilan\e[0m"
      puts "  \e[2mke Gemini. Konsistensi antar-run dan uji invariansi nama perlu menjalankan\e[0m"
      puts "  \e[2mmodel, dan belum tercakup di sini.\e[0m\n\n"
    end
  end
end
