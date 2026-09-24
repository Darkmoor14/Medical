// Trimmed-down efetch XML in the shape PubMed returns.
export const EFETCH_XML = `<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID Version="1">111</PMID>
      <Article>
        <Journal>
          <JournalIssue><Volume>388</Volume><Issue>2</Issue><PubDate><Year>2023</Year><Month>Jan</Month></PubDate></JournalIssue>
          <Title>The New England journal of medicine</Title>
          <ISOAbbreviation>N Engl J Med</ISOAbbreviation>
        </Journal>
        <ArticleTitle>Empagliflozin in chronic kidney disease.</ArticleTitle>
        <Pagination><MedlinePgn>117-127</MedlinePgn></Pagination>
        <Abstract>
          <AbstractText Label="BACKGROUND">SGLT2 inhibitors slow CKD.</AbstractText>
          <AbstractText Label="RESULTS">Fewer events with <i>empagliflozin</i>.</AbstractText>
        </Abstract>
        <AuthorList>
          <Author><LastName>Herrington</LastName><ForeName>William G</ForeName><Initials>WG</Initials></Author>
          <Author><CollectiveName>EMPA-KIDNEY Group</CollectiveName></Author>
        </AuthorList>
        <PublicationTypeList>
          <PublicationType>Journal Article</PublicationType>
          <PublicationType>Randomized Controlled Trial</PublicationType>
        </PublicationTypeList>
      </Article>
      <MeshHeadingList>
        <MeshHeading><DescriptorName>Renal Insufficiency, Chronic</DescriptorName></MeshHeading>
        <MeshHeading><DescriptorName>Humans</DescriptorName></MeshHeading>
      </MeshHeadingList>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">111</ArticleId>
        <ArticleId IdType="doi">10.1056/example</ArticleId>
        <ArticleId IdType="pmc">PMC999</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation>
      <PMID Version="1">222</PMID>
      <Article>
        <Journal>
          <JournalIssue><PubDate><MedlineDate>2019 Nov-Dec</MedlineDate></PubDate></JournalIssue>
          <Title>Example Journal</Title>
        </Journal>
        <ArticleTitle>Metformin and eGFR.</ArticleTitle>
        <AuthorList><Author><LastName>Smith</LastName><Initials>J</Initials></Author></AuthorList>
        <PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList>
      </Article>
      <CommentsCorrectionsList>
        <CommentsCorrections RefType="RetractionIn"><PMID Version="1">999</PMID></CommentsCorrections>
      </CommentsCorrectionsList>
    </MedlineCitation>
    <PubmedData><ArticleIdList><ArticleId IdType="pubmed">222</ArticleId></ArticleIdList></PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;
