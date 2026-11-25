# Every partner gets a page: partners without their own page (no `page:` in _data/partners.yml or
# _data/partner/<name>.yml) get a generated one at /partners/<slug>/ – logo, description, website and, above all, the
# semantic connections („Verbindungen“: projects, events, posts, equipment … that name the partner). The entry's
# `page` is set to that address, so every template that links partners (overview, „Verbindungen“, owners, network,
# map) links the new page. Written pages (partners/<name>/index.md) always win.
# Content: _includes/partner-seite.html. ✏️ opens the partner's data file on GitHub (page.path).
module IfsmbPartnerPages
  class Generator < Jekyll::Generator
    priority :high # after IfsmbEinzeldateien (:highest), which appends _data/partner/*.yml to the list

    def generate(site)
      partners = site.data["partners"]
      return unless partners.is_a?(Array)

      # which data file an entry comes from (for the ✏️ button)
      sources = {}
      (site.data["partner"] || {}).each do |file, entry|
        sources[entry["name"]] = "_data/partner/#{file}.yml" if entry.is_a?(Hash)
      end
      taken = site.pages.map(&:url)
      partners.each do |pt|
        next unless pt.is_a?(Hash) && pt["name"].to_s.strip != ""
        next unless pt["page"].to_s.strip.empty?

        slug = Jekyll::Utils.slugify(pt["name"], mode: "latin")
        url = "/partners/#{slug}/"
        if taken.include?(url)
          Jekyll::logger.warn "Partnerseiten:", "#{url} gibt es schon – „#{pt['name']}“ bekommt keine eigene Seite"
          next
        end
        page = Jekyll::PageWithoutAFile.new(site, site.source, "partners/#{slug}", "index.html")
        page.content = "{% include partner-seite.html %}"
        page.data.merge!(
          "layout" => "page",
          "title" => pt["name"],
          "partner_name" => pt["name"],
          "path" => sources[pt["name"]] || "_data/partners.yml",
          "generated_partner_page" => true
        )
        page.data["theme"] = pt["theme"] if pt["theme"]
        site.pages << page
        pt["page"] = url
        taken << url
      end
    end
  end
end
