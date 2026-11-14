from pipeline.extract_schedule import page_count, parse_page

PAGE = """
<td>Page (1&nbsp;of&nbsp;38)</td>
<span onclick="openNewWindow('/x?termCode=WI26&courseId=CSE21    ');">Prerequisites</span>
<tr class="sectxt"><td><span id="insTyp" title="Lecture">LE</span></td>
  <td><a href="#!" onclick="javascript:sendMail('/x?pid=1')">Jones, Miles E                     </a></td></tr>
<tr class="sectxt"><td><span id="insTyp" title="Seminar">SE</span></td>
  <td><a href="#!" onclick="javascript:sendMail('/x?pid=4')">Prof, Seminar A</a></td></tr>
<tr class="sectxt"><td><span id="insTyp" title="Discussion">DI</span></td>
  <td><a href="#!" onclick="javascript:sendMail('/x?pid=2')">Some, TA                    </a></td></tr>
<span onclick="openNewWindow('/x?termCode=WI26&courseId=CSE101    ');">Prerequisites</span>
<tr class="sectxt"><td><span id="insTyp" title="Lecture">LE</span></td>
  <td><a href="#!" onclick="javascript:sendMail('/x?pid=3')">Kane, Daniel M</a></td></tr>
"""


def test_lectures_are_paired_with_their_course_and_other_sections_ignored():
    assert parse_page(PAGE) == [("CSE21", "Jones, Miles E"), ("CSE21", "Prof, Seminar A"), ("CSE101", "Kane, Daniel M")]


def test_page_count():
    assert page_count(PAGE) == 38 and page_count("no pager") == 1
