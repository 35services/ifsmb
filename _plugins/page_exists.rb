# Liquid filter `page_exists`: true if this site builds a page at the given URL (path only, #fragment ignored).
# Lets layouts and includes link to optional pages (/spenden/, /tags/, /map/ …) only where an instance has them –
# a federated copy may have removed them. Usage:
#   {% assign has_tags = '/tags/' | page_exists %}{% if has_tags %}<a href="{{ '/tags/' | relative_url }}">…</a>{% endif %}
require "set"

module PageExists
  @urls = nil

  def self.reset!
    @urls = nil
  end

  def self.urls(site)
    @urls ||= Set.new(
      site.pages.map(&:url) +
      site.collections.values.flat_map { |c| c.docs.map(&:url) }
    )
  end

  module Filter
    def page_exists(input)
      path = input.to_s.sub(/#.*/, "")
      path = "/" if path.empty?
      PageExists.urls(@context.registers[:site]).include?(path)
    end
  end
end

Jekyll::Hooks.register :site, :pre_render do |_site|
  PageExists.reset!
end

Liquid::Template.register_filter(PageExists::Filter)
