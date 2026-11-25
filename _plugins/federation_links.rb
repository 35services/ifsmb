# Resolves links to connected instances (federation) at build time.
#
# For every <a href> in a rendered HTML page that points to an instance listed in _config.yml `federation`, the
# linked page is fetched once per build (CI) and its Microdata is read (_includes/microdata.html on the other side:
# itemscope/itemtype/itemid, itemprop name/identifier …). The link then gets
#   class "fed-link fed-<type>", data-fed-type, data-fed-name, a title "<name> – <host>"
# and, if it is a "title link" (its text is a copy of the name, see title_link?), the current name as text.
# A page that no longer exists (404/410) gets class "fed-missing" and a visible note. Network errors change nothing
# but the class "fed-link" (assets/js/federation-links.js may still resolve it live).
#
# Trust: the URL says nothing about the type – only the Microdata of the fetched page does, and only known schema.org
# types are mapped (TYPES). Names are inserted as escaped text, never as HTML. Only configured instances are fetched;
# visitors make no request for this. IFSMB_OFFLINE=1 skips all fetching.
require "net/http"
require "uri"
require "cgi"

module FederationLinks
  # schema.org type → resource type (CSS class fed-<type>, icon); everything else stays without type
  TYPES = {
    "Product" => "equipment", "Person" => "person", "Organization" => "partner", "Event" => "event",
    "BlogPosting" => "post", "Project" => "project", "CreativeWork" => "challenge", "NewsArticle" => "press"
  }.freeze
  ICONS = {
    "equipment" => "🛠️", "person" => "👤", "partner" => "🤝", "event" => "📅", "post" => "📰",
    "project" => "🔧", "challenge" => "🧗", "press" => "🗞️"
  }.freeze
  TTL = 600 # seconds – `jekyll serve` rebuilds often; a fetched page is reused for 10 minutes
  @cache = {}

  class << self
    attr_reader :cache

    def hosts(site)
      Array(site.config["federation"]).filter_map do |u|
        uri = URI.parse(u.to_s)
        uri.host if uri.is_a?(URI::HTTP)
      rescue URI::InvalidURIError
        nil
      end
    end

    # => { status: :ok, type:, name: } | { status: :missing } | { status: :unknown }
    def resolve(url)
      hit = @cache[url]
      return hit[:result] if hit && Time.now - hit[:at] < TTL

      result = begin
        res = fetch(url)
        case res
        when Net::HTTPSuccess then parse(res.body.to_s.dup.force_encoding("UTF-8"), url)
        when Net::HTTPNotFound, Net::HTTPGone then { status: :missing }
        else { status: :unknown }
        end
      rescue StandardError => e
        Jekyll.logger.warn "Föderation:", "#{url} nicht erreichbar (#{e.class})"
        { status: :unknown }
      end
      @cache[url] = { at: Time.now, result: result }
      result
    end

    def fetch(url, redirects = 3)
      uri = URI.parse(url)
      res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 5, read_timeout: 8) do |http|
        http.get(uri.request_uri, "User-Agent" => "ifsmb-federation (Jekyll build)", "Accept" => "text/html")
      end
      # GitHub Pages redirects /path to /path/ – follow redirects on the same host only
      if res.is_a?(Net::HTTPRedirection) && redirects.positive?
        target = URI.join(url, res["location"].to_s)
        return fetch(target.to_s, redirects - 1) if target.host == uri.host
      end
      res
    end

    def attr(tag, name)
      m = tag.match(/\b#{name}\s*=\s*("([^"]*)"|'([^']*)')/i)
      m && CGI.unescapeHTML(m[2] || m[3])
    end

    # Microdata of the item described by the page: the element with itemscope whose itemid is the URL, else the
    # first item. Top-level meta/link/text properties up to the next nested item are enough for name and type.
    def parse(html, url)
      scopes = html.scan(/<[a-z][a-z0-9]*\b[^>]*\bitemscope\b[^>]*>/i)
      norm = url.sub(%r{/?\z}, "/")
      root = scopes.find { |t| (attr(t, "itemid") || "").sub(%r{/?\z}, "/") == norm } || scopes.first
      name = nil
      type = nil
      if root
        type = TYPES[(attr(root, "itemtype") || "").split.first.to_s.sub(%r{\Ahttps?://schema\.org/}, "")]
        rest = html[(html.index(root) + root.length)..] || ""
        stop = rest =~ /<[a-z][a-z0-9]*\b[^>]*\bitemscope\b/i
        segment = stop ? rest[0...stop] : rest
        segment.scan(/<(?:meta|link)\b[^>]*>/i) do |t|
          next unless attr(t, "itemprop").to_s.split.include?("name")
          name ||= attr(t, "content")
        end
        name ||= (m = segment.match(/<([a-z][a-z0-9]*)\b[^>]*\bitemprop\s*=\s*["']name["'][^>]*>(.*?)<\/\1>/im)) && strip(m[2])
      end
      # no Microdata (yet): the page title still tells the current name – but no type
      name ||= (m = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i)) && CGI.unescapeHTML(m[1])
      name ||= (m = html.match(/<title>(.*?)<\/title>/im)) && strip(m[1])
      { status: :ok, type: type, name: name.to_s.strip.empty? ? nil : name.strip }
    end

    def strip(s)
      CGI.unescapeHTML(s.to_s.gsub(/<[^>]*>/, " ")).gsub(/\s+/, " ").strip
    end

    def simplify(s)
      s.to_s.downcase.gsub(/[^[:alnum:]]+/, " ").strip
    end

    # The link text is a copy of the name (or the bare URL) → show the current name. Only texts that are the name
    # or a shortened copy of it count ("Snapmaker U1" → "Snapmaker U1 mit Einhausung"); texts with own words
    # ("Spenden für die AG", "Pressemitteilung: …", "der Drucker der AG") keep them.
    def title_link?(text, name, url)
      t = simplify(text)
      n = simplify(name)
      return false if t.empty? || n.empty?
      return true if t == n || t == simplify(url) || t == simplify(url.sub(%r{\Ahttps?://}, ""))
      n.include?(t) && t.length >= 6
    end

    def missing_note(site)
      text = site.data.dig("i18n", "de", "federation", "missing") || "nicht mehr vorhanden"
      %( <span class="fed-hinweis" data-i18n="federation.missing">(#{CGI.escapeHTML(text)})</span>)
    end

    def add_class(attrs, classes)
      if attrs =~ /\bclass\s*=\s*"([^"]*)"/i
        attrs.sub(/\bclass\s*=\s*"([^"]*)"/i) { %(class="#{[Regexp.last_match(1), classes].join(' ').strip}") }
      else
        %(#{attrs} class="#{classes}")
      end
    end

    def rewrite(html, site)
      hosts = hosts(site)
      return html if hosts.empty? || ENV["IFSMB_OFFLINE"] == "1"

      host_re = hosts.map { |h| Regexp.escape(h) }.join("|")
      anchor = %r{<a\b([^>]*?)\bhref="(https?://(?:#{host_re})/[^"]*)"([^>]*)>(.*?)</a>}im
      html.gsub(anchor) do
        before, url, after, inner = Regexp.last_match(1), Regexp.last_match(2), Regexp.last_match(3), Regexp.last_match(4)
        attrs = "#{before}href=\"#{url}\"#{after}"
        # a link to a section (#…) points to a part of a page – only whether the page still exists counts
        section = url.include?("#")
        info = resolve(CGI.unescapeHTML(url).sub(/#.*/, ""))
        info = { status: :unknown } if section && info[:status] == :ok
        host = URI.parse(url).host
        case info[:status]
        when :missing
          "<a#{add_class(attrs, 'fed-link fed-missing')}>#{inner}</a>#{missing_note(site)}"
        when :ok
          type = info[:type]
          name = info[:name]
          classes = ["fed-link", (type && "fed-#{type}")].compact.join(" ")
          extra = +""
          extra << %( data-fed-type="#{type}") if type
          if name
            extra << %( data-fed-name="#{CGI.escapeHTML(name)}")
            extra << %( title="#{CGI.escapeHTML("#{name} – #{host}")}") unless attrs =~ /\btitle\s*=/i
          end
          text = strip(inner)
          if attrs.include?("fed-auto") && name
            # generated link (e.g. „Verbindungen“): icon of the type + current name
            inner = %(<span aria-hidden="true">#{ICONS[type] || '🌐'}</span> #{CGI.escapeHTML(name)})
          elsif name && inner !~ /</ && title_link?(text, name, url)
            extra << %( data-fed-title="1" data-fed-fallback="#{CGI.escapeHTML(text)}")
            inner = CGI.escapeHTML(name)
          end
          "<a#{add_class(attrs, classes)}#{extra}>#{inner}</a>"
        else
          "<a#{add_class(attrs, 'fed-link')}>#{inner}</a>"
        end
      end
    end
  end
end

# Liquid filter for templates that sort links by type (_includes/verbindungen.html):
#   {% assign fi = url | federation_resolve %} → { "status" => "ok"|"missing"|"unknown"|"other", "type", "name",
#   "url", "short" (without scheme), "host" } – "other": not a connected instance. Uses the same per-build cache.
module FederationLinks
  module Filter
    def federation_resolve(input)
      url = input.to_s.strip
      host = begin
        URI.parse(url).host
      rescue URI::InvalidURIError
        nil
      end
      base = { "url" => url, "short" => url.sub(%r{\Ahttps?://}, ""), "host" => host }
      return base.merge("status" => "other") unless host && FederationLinks.hosts(@context.registers[:site]).include?(host)
      return base.merge("status" => "unknown") if ENV["IFSMB_OFFLINE"] == "1"

      info = FederationLinks.resolve(url.sub(/#.*/, ""))
      info = { status: :unknown } if url.include?("#") && info[:status] == :ok # a section: only existence counts
      base.merge("status" => info[:status].to_s, "type" => info[:type], "name" => info[:name])
    end
  end
end
Liquid::Template.register_filter(FederationLinks::Filter)

Jekyll::Hooks.register [:pages, :documents], :post_render do |doc|
  next unless doc.output_ext == ".html" && doc.output
  doc.output = FederationLinks.rewrite(doc.output, doc.site)
end
