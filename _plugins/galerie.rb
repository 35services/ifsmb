# frozen_string_literal: true

require 'cgi'

# Markdown galleries.
#
# In Markdown, put images on consecutive lines and mark the paragraph with {: .gallery}:
#
#   ![Alt text 1](/assets/images/news/foo/01.jpg)
#   ![Alt text 2](/assets/images/news/foo/02.jpg)
#   {: .gallery}
#
# Kramdown renders that as <p class="gallery"><img …><img …></p>. After rendering, this hook
# turns it into the gallery markup used by the lightbox in _layouts/default.html:
#
#   <div class="gallery"><a class="lightbox" href="01.jpg"><img src="01-600w.jpg" alt="…" loading="lazy"></a>…</div>
#
# - Thumbnail: "<name>-600w.<ext>" next to the image is used if it exists, otherwise the image itself.
# - A gallery with a single image gets "gallery-single" (unless another size class like gallery-small is set).
# - Every image needs an alt text, otherwise the build stops.
# - Videos: a Markdown image pointing to .mp4/.webm becomes <video class="post-video">, with "<name>.jpg" as poster if
#   that file exists.
# - Audio: .mp3/.m4a/.ogg/.wav in its own paragraph becomes <figure class="post-audio"> with <audio controls>.
# - 3D models: .stl/.3mf in its own paragraph becomes <figure class="modell-3d"> – assets/js/model3d.js shows it
#   (WebGL, no library; small files load when visible, big ones on a tap). The alt text is the caption.
# - Downloads: every file under /assets/dateien/ the content points to (embedded or linked) is listed once more at
#   the end of the content as "📎 Dateien" with type and size (hook :post_convert, so it lands inside .prose).
#   The ➕/✏️ forms put uploaded attachments there (assets/js/neu.js, "📎 Datei").
module Galerie
  IMG_RE = /<img\b([^>]*?)\s*\/?>/m.freeze
  ATTR_RE = /([a-zA-Z-]+)="([^"]*)"/.freeze
  GALLERY_RE = %r{<p class="(gallery(?:\s[^"]*)?)">(.*?)</p>}m.freeze
  VIDEO_RE = %r{<p>\s*(<img\b[^>]*?src="[^"]+\.(?:mp4|webm|mov|m4v)"[^>]*?/?>)\s*</p>}mi.freeze
  AUDIO_RE = %r{<p>\s*(<img\b[^>]*?src="[^"]+\.(?:mp3|m4a|ogg|wav)"[^>]*?/?>)\s*</p>}mi.freeze
  MODEL_RE = %r{<p>\s*(<img\b[^>]*?src="[^"]+\.(?:stl|3mf)"[^>]*?/?>)\s*</p>}mi.freeze
  FILES_DIR = '/assets/dateien/'
  TYPE_NAMES = { 'stl' => 'STL', '3mf' => '3MF', 'mp4' => 'Video (MP4)', 'webm' => 'Video (WebM)', 'mov' => 'Video (MOV)', 'm4v' => 'Video (M4V)', 'mp3' => 'Audio (MP3)',
                 'm4a' => 'Audio (M4A)', 'ogg' => 'Audio (OGG)', 'wav' => 'Audio (WAV)', 'pdf' => 'PDF', 'zip' => 'ZIP' }.freeze
  SIZE_CLASSES = %w[gallery-single gallery-small].freeze

  module_function

  def attrs(tag)
    tag.scan(ATTR_RE).to_h
  end

  def exists?(site, url)
    path = url.sub(%r{\A#{Regexp.escape(site.config['baseurl'].to_s)}}, '')
    File.exist?(File.join(site.source, path))
  end

  def thumb_for(site, src)
    thumb = src.sub(/(\.[a-zA-Z0-9]+)\z/, '-600w\1')
    exists?(site, thumb) ? thumb : src
  end

  def esc(s)
    s.to_s.gsub('&', '&amp;').gsub('"', '&quot;').gsub('<', '&lt;').gsub('>', '&gt;')
  end

  def gallery(site, doc, classes, inner)
    images = inner.scan(IMG_RE).map { |m| attrs(m[0]) }
    return nil if images.empty? || inner.gsub(IMG_RE, '').strip != ''

    classes = classes.split
    classes << 'gallery-single' if images.size == 1 && (classes & SIZE_CLASSES).empty?
    links = images.map do |a|
      src = a['src']
      alt = a['alt'].to_s
      if alt.strip.empty?
        raise Jekyll::Errors::FatalException, "Galerie: Bild ohne Alt-Text in #{doc.relative_path}: #{src}"
      end
      %(  <a class="lightbox" href="#{src}"><img src="#{thumb_for(site, src)}" alt="#{alt}" loading="lazy"></a>)
    end
    %(<div class="#{classes.uniq.join(' ')}">\n#{links.join("\n")}\n</div>)
  end

  def video(site, img_tag)
    a = attrs(img_tag)
    src = a['src']
    poster = src.sub(/\.[a-zA-Z0-9]+\z/, '.jpg')
    poster_attr = exists?(site, poster) ? %( poster="#{poster}") : ''
    label = a['alt'].to_s.strip.empty? ? '' : %( aria-label="#{a['alt']}")
    %(<video class="post-video" controls preload="#{poster_attr.empty? ? 'metadata' : 'none'}" playsinline#{poster_attr} src="#{src}"#{label}></video>)
  end

  def caption(alt)
    alt.to_s.strip.empty? || alt.strip == '...' ? '' : %(<figcaption>#{alt}</figcaption>)
  end

  def audio(img_tag)
    a = attrs(img_tag)
    label = a['alt'].to_s.strip.empty? ? '' : %( aria-label="#{a['alt']}")
    %(<figure class="post-audio"><audio controls preload="none" src="#{a['src']}"#{label}></audio>#{caption(a['alt'])}</figure>)
  end

  def model(site, img_tag)
    a = attrs(img_tag)
    src = a['src']
    file = local_file(site, src)
    size = file ? File.size(file) : 0
    %(<figure class="modell-3d" data-model="#{src}" data-size="#{size}" data-alt="#{a['alt']}">#{caption(a['alt'])}</figure>) +
      %(<script src="#{site.config['baseurl']}/assets/js/model3d.js" defer></script>)
  end

  def local_file(site, url)
    path = url.sub(%r{\A#{Regexp.escape(site.config['baseurl'].to_s)}}, '').split(/[?#]/).first
    file = File.join(site.source, path)
    File.file?(file) ? file : nil
  end

  def human_size(bytes)
    return "#{(bytes / 1024.0 / 1024).round(1).to_s.tr('.', ',')} MB" if bytes >= 1024 * 1024

    "#{[(bytes / 1024.0).round, 1].max} KB"
  end

  # "📎 Dateien" at the end of the content: every /assets/dateien/ file the text points to, in order, once
  def downloads(doc)
    base = Regexp.escape(doc.site.config['baseurl'].to_s)
    urls = doc.content.scan(%r{(?:src|href)="(#{base}#{Regexp.escape(FILES_DIR)}[^"#?]+)"}).flatten.uniq
    return if urls.empty?

    items = urls.map do |url|
      name = File.basename(url)
      ext = File.extname(name).delete('.').downcase
      file = local_file(doc.site, url)
      meta = [TYPE_NAMES[ext] || ext.upcase, file && human_size(File.size(file))].compact.join(' · ')
      %(<li><a href="#{url}" download>#{esc(CGI.unescape(name))}</a> <span class="muted small">#{meta}</span></li>)
    end
    title = IfsmbI18n.lookup(doc.site, 'de', 'files.title') || 'Dateien'
    doc.content += %(\n<section class="post-dateien" data-pagefind-ignore>\n<h2 data-i18n="files.title">#{esc(title)}</h2>\n<ul>\n#{items.join("\n")}\n</ul>\n</section>\n)
  end

  def process(doc)
    return unless doc.output && doc.output_ext == '.html' && doc.output.include?('<p')

    site = doc.site
    out = doc.output.gsub(GALLERY_RE) do
      gallery(site, doc, Regexp.last_match(1), Regexp.last_match(2)) || Regexp.last_match(0)
    end
    out = out.gsub(VIDEO_RE) { video(site, Regexp.last_match(1)) }
    out = out.gsub(AUDIO_RE) { audio(Regexp.last_match(1)) }
    out = out.gsub(MODEL_RE) { model(site, Regexp.last_match(1)) }
    doc.output = out
  end
end

Jekyll::Hooks.register [:pages, :documents], :post_render do |doc|
  Galerie.process(doc)
end

Jekyll::Hooks.register [:pages, :documents], :post_convert do |doc|
  Galerie.downloads(doc) if doc.output_ext == '.html' && doc.content.include?(Galerie::FILES_DIR)
end
